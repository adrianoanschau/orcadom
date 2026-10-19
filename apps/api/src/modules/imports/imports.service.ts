import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillStatus, ImportSource, ImportStatus, PostingStatus, Prisma } from '@orcadom/database';
import type { ConfirmImportDto } from '@orcadom/types';
import { randomUUID } from 'node:crypto';
import { accessibleAccountWhere, assertAccountAccessible, getAccessibleAccountIds } from '../../common/account-access.js';
import { addDaysKey, noonUtcFromKey, utcDateKey } from '../../common/calendar.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { recordImportReconciliation, recordImportReconciliationConflict } from '../../common/observability/metrics.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import {
  hydratePreviewRows,
  ImportPreviewStore,
  serializePreviewRows,
  type SerializedImportRow,
  type StoredImportPreview,
  type StoredImportRow,
} from './import-preview.store.js';
import { parseCsv } from './parsers/csv.js';
import { parseOfx } from './parsers/ofx.js';
import {
  BILL_MATCH_WIDE,
  matchImportRows,
  RECONCILE_TX_DAYS,
  type MatchBillCandidate,
  type MatchLine,
  type MatchTransactionCandidate,
  type RowReconciliation,
} from './match-import-rows.js';
import { decodeStatementText, detectFormat, type ParsedStatementRow } from './parsers/shared.js';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface CreatePendingBatchInput {
  householdId: string;
  accountId: string | null;
  fileName: string;
  format: 'OFX' | 'CSV';
  source: ImportSource;
  status: ImportStatus;
  bankId?: string | null;
  acctId?: string | null;
  householdMemberId?: string;
  rows: ParsedStatementRow[];
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ImportPreviewStore,
    private readonly categoryMemory: CategoryMemoryService,
    private readonly transactions: TransactionsService,
  ) {}

  async upload(
    householdId: string,
    householdMemberId: string,
    accountId: string,
    file: UploadedFile | undefined,
  ) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Envie um arquivo OFX ou CSV.');
    }
    await this.assertAccount(householdId, householdMemberId, accountId);

    const text = decodeStatementText(file.buffer);
    const format = detectFormat(file.originalname, text);
    if (!format) {
      throw new BadRequestException('Formato não suportado. Envie um arquivo OFX ou CSV.');
    }

    let parsed: ParsedStatementRow[];
    try {
      parsed = format === 'OFX' ? parseOfx(text) : parseCsv(text);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Não foi possível ler o arquivo.',
      );
    }
    if (parsed.length === 0) {
      throw new BadRequestException('Nenhum lançamento encontrado no arquivo.');
    }

    return this.createPendingBatch({
      householdId,
      householdMemberId,
      accountId,
      fileName: file.originalname || `extrato.${format.toLowerCase()}`,
      format,
      source: ImportSource.MANUAL,
      status: ImportStatus.PENDING,
      rows: parsed,
    });
  }

  async createPendingBatch(input: CreatePendingBatchInput) {
    const rows: StoredImportRow[] = input.rows.map((row) => ({
      ...row,
      lineId: randomUUID(),
      isDuplicate: false,
    }));
    const duplicateRows = input.accountId
      ? (await this.markDuplicates(input.householdId, input.accountId, rows)).length
      : 0;

    const batch = await this.prisma.client.importBatch.create({
      data: {
        householdId: input.householdId,
        accountId: input.accountId,
        fileName: input.fileName,
        format: input.format,
        source: input.source,
        status: input.status,
        bankId: input.bankId ?? null,
        acctId: input.acctId ?? null,
        totalRows: rows.length,
        duplicateRows,
        preview: serializePreviewRows(rows) as unknown as Prisma.InputJsonValue,
      },
    });

    this.cachePreview(batch.id, {
      householdId: input.householdId,
      accountId: input.accountId,
      fileName: batch.fileName,
      format: input.format,
      bankId: input.bankId ?? null,
      acctId: input.acctId ?? null,
      rows,
    });

    return this.toPreview(batch, rows, input.householdId, input.householdMemberId);
  }

  async listOpen(householdId: string, householdMemberId: string) {
    const batches = await this.prisma.client.importBatch.findMany({
      where: {
        householdId,
        status: { in: [ImportStatus.PENDING, ImportStatus.UNMAPPED_ACCOUNT] },
        OR: [
          { accountId: null },
          { account: accessibleAccountWhere(householdId, householdMemberId) },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        format: true,
        source: true,
        status: true,
        accountId: true,
        bankId: true,
        acctId: true,
        totalRows: true,
        duplicateRows: true,
        createdAt: true,
      },
    });

    return batches.map((batch) => ({
      ...batch,
      createdAt: batch.createdAt.toISOString(),
    }));
  }

  async preview(householdId: string, householdMemberId: string, batchId: string) {
    const batch = await this.findOwnedBatch(householdId, householdMemberId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.UNMAPPED_ACCOUNT) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.loadPreview(batch);
    if (stored?.householdId !== householdId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }
    if (stored.accountId) {
      await this.markDuplicates(householdId, stored.accountId, stored.rows);
    }
    return this.toPreview(batch, stored.rows, householdId, householdMemberId);
  }

  async confirm(
    householdId: string,
    householdMemberId: string,
    userId: string,
    batchId: string,
    dto: ConfirmImportDto,
  ) {
    const batch = await this.findOwnedBatch(householdId, householdMemberId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.UNMAPPED_ACCOUNT) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.loadPreview(batch);
    if (stored?.householdId !== householdId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }

    const accountId = dto.accountId ?? stored.accountId ?? batch.accountId;
    if (!accountId) {
      throw new BadRequestException('Selecione a conta deste extrato antes de confirmar.');
    }
    await this.assertAccount(householdId, householdMemberId, accountId);

    if (batch.bankId && batch.acctId) {
      await this.prisma.client.bankAccountMapping.upsert({
        where: {
          householdId_bankId_acctId: { householdId, bankId: batch.bankId, acctId: batch.acctId },
        },
        update: { accountId },
        create: { householdId, bankId: batch.bankId, acctId: batch.acctId, accountId },
      });
    }

    const byLineId = new Map(stored.rows.map((row) => [row.lineId, row]));
    const selected = dto.rows.map((row) => {
      const storedRow = byLineId.get(row.lineId);
      if (!storedRow) {
        throw new BadRequestException('Uma das linhas da prévia não foi encontrada.');
      }
      return {
        ...storedRow,
        action: row.action ?? ('IMPORT' as const),
        categoryId: row.categoryId,
        transactionId: row.transactionId,
        billId: row.billId,
      };
    });

    await this.assertCategories(
      householdId,
      selected.flatMap((row) =>
        row.action === 'IMPORT' && row.categoryId
          ? [{ categoryId: row.categoryId, type: row.type }]
          : [],
      ),
    );

    const confirmed = await this.prisma.client.$transaction(async (raw) => {
      const tx = raw as Prisma.TransactionClient;
      const billIds = selected
        .flatMap((row) => (row.action === 'PAY_BILL' && row.billId ? [row.billId] : []))
        .sort();
      const transactionIds = selected
        .flatMap((row) => (row.action === 'LINK_TRANSACTION' && row.transactionId ? [row.transactionId] : []))
        .sort();
      for (const billId of billIds) {
        await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} AND "householdId" = ${householdId} FOR UPDATE`;
      }
      for (const transactionId of transactionIds) {
        await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${transactionId} AND "householdId" = ${householdId} FOR UPDATE`;
      }

      const reconciliation = await this.reconciliationFor(
        householdId,
        householdMemberId,
        accountId,
        stored.rows,
      );
      const conflicts = selected
        .filter((row) => !this.decisionStillValid(reconciliation.get(row.lineId), row))
        .map((row) => row.lineId);
      if (conflicts.length > 0) {
        recordImportReconciliationConflict();
        throw new ConflictException({
          code: 'RECONCILIATION_CONFLICT',
          rowIds: conflicts,
          message: 'Algumas linhas mudaram. Revise as marcadas e confirme de novo.',
        });
      }

      let importedRows = 0;
      let skippedRows = 0;
      let reconciledRows = 0;
      const events = [];
      const resolutions: { action: string; confidence: string }[] = [];
      for (const row of selected) {
        if (row.action === 'SKIP' || row.isDuplicate) {
          skippedRows += 1;
          resolutions.push({ action: row.isDuplicate ? 'SKIP' : row.action, confidence: 'none' });
          continue;
        }
        if (row.action === 'LINK_TRANSACTION' && row.transactionId) {
          const current = await tx.transaction.findFirst({
            where: { id: row.transactionId, householdId, externalId: null },
          });
          if (!current) {
            recordImportReconciliationConflict();
            throw new ConflictException({
              code: 'RECONCILIATION_CONFLICT',
              rowIds: [row.lineId],
              message: 'Algumas linhas mudaram. Revise as marcadas e confirme de novo.',
            });
          }
          await tx.transaction.update({
            where: { id: current.id },
            data: { externalId: row.externalId, importBatchId: batch.id },
          });
          if (current.categoryId) {
            await this.categoryMemory.upsert(householdId, row.description, current.categoryId, tx);
          }
          reconciledRows += 1;
          resolutions.push({ action: 'LINK_TRANSACTION', confidence: 'high' });
          continue;
        }
        if (row.action === 'PAY_BILL' && row.billId) {
          const bill = await tx.bill.findFirst({ where: { id: row.billId, householdId, status: BillStatus.PENDING } });
          if (!bill) {
            recordImportReconciliationConflict();
            throw new ConflictException({
              code: 'RECONCILIATION_CONFLICT',
              rowIds: [row.lineId],
              message: 'Algumas linhas mudaram. Revise as marcadas e confirme de novo.',
            });
          }
          const paid = bill.targetAccountId
            ? await this.transactions.createWithin(
                tx,
                householdId,
                userId,
                {
                  description: bill.description,
                  amount: row.amount,
                  type: 'TRANSFER',
                  date: row.date.toISOString(),
                  fromAccountId: accountId,
                  toAccountId: bill.targetAccountId,
                },
                {
                  source: 'IMPORTED',
                  externalId: row.externalId,
                  importBatchId: batch.id,
                  memorySource: row.description,
                },
              )
            : await this.transactions.createWithin(
                tx,
                householdId,
                userId,
                {
                  description: bill.description,
                  amount: row.amount,
                  type: 'EXPENSE',
                  date: row.date.toISOString(),
                  accountId,
                  categoryId: row.categoryId ?? bill.categoryId ?? undefined,
                },
                {
                  source: 'IMPORTED',
                  externalId: row.externalId,
                  importBatchId: batch.id,
                  memorySource: row.description,
                },
              );
          await tx.bill.update({
            where: { id: bill.id },
            data: { status: BillStatus.PAID, transactionId: paid.transaction.id, settlement: 'LINKED' },
          });
          events.push(...paid.events);
          importedRows += 1;
          resolutions.push({ action: 'PAY_BILL', confidence: 'high' });
          continue;
        }
        if (!row.categoryId) throw new BadRequestException('Categoria é obrigatória.');
        const externalId = await this.uniqueExternalId(tx, accountId, row.externalId);
        const created = await this.transactions.createWithin(
          tx,
          householdId,
          userId,
          {
            description: row.description,
            amount: row.amount,
            type: row.type,
            date: row.date.toISOString(),
            accountId,
            categoryId: row.categoryId,
          },
          { source: 'IMPORTED', externalId, importBatchId: batch.id },
        );
        events.push(...created.events);
        importedRows += 1;
        resolutions.push({ action: 'IMPORT', confidence: 'none' });
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          accountId,
          status: ImportStatus.CONFIRMED,
          importedRows,
          duplicateRows: skippedRows,
          reconciledRows,
          confirmedAt: new Date(),
          preview: Prisma.DbNull,
        },
      });
      return { importedRows, skippedRows, reconciledRows, events, resolutions };
    });

    this.store.delete(batchId);
    for (const resolution of confirmed.resolutions) {
      recordImportReconciliation(resolution.action, resolution.confidence);
    }
    await this.transactions.flushEvents(confirmed.events);
    return {
      id: batch.id,
      accountId,
      importedRows: confirmed.importedRows,
      skippedRows: confirmed.skippedRows,
      reconciledRows: confirmed.reconciledRows,
    };
  }

  async discard(householdId: string, householdMemberId: string, batchId: string): Promise<void> {
    const batch = await this.findOwnedBatch(householdId, householdMemberId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.UNMAPPED_ACCOUNT) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    await this.prisma.client.importBatch.update({
      where: { id: batch.id },
      data: { status: ImportStatus.DISCARDED, preview: Prisma.DbNull },
    });
    this.store.delete(batchId);
  }

  private cachePreview(batchId: string, payload: StoredImportPreview): void {
    this.store.set(batchId, payload);
  }

  private loadPreview(batch: {
    id: string;
    householdId: string;
    accountId: string | null;
    fileName: string;
    format: 'OFX' | 'CSV';
    bankId: string | null;
    acctId: string | null;
    preview: unknown;
  }): StoredImportPreview | null {
    const cached = this.store.get(batch.id);
    if (cached?.householdId === batch.householdId) return cached;
    if (!Array.isArray(batch.preview)) return null;

    const rows = hydratePreviewRows(batch.preview as SerializedImportRow[]);
    const payload: StoredImportPreview = {
      householdId: batch.householdId,
      accountId: batch.accountId,
      fileName: batch.fileName,
      format: batch.format,
      bankId: batch.bankId,
      acctId: batch.acctId,
      rows,
    };
    this.cachePreview(batch.id, payload);
    return payload;
  }

  private async markDuplicates(
    householdId: string,
    accountId: string,
    rows: StoredImportRow[],
  ): Promise<StoredImportRow[]> {
    const existing = await this.prisma.client.transaction.findMany({
      where: {
        householdId,
        accountId,
        externalId: { in: rows.map((row) => row.externalId) },
      },
      select: { externalId: true },
    });
    const known = new Set(existing.map((row) => row.externalId).filter((id): id is string => Boolean(id)));
    const seen = new Set<string>();
    const duplicates: StoredImportRow[] = [];

    for (const row of rows) {
      const repeated = known.has(row.externalId) || seen.has(row.externalId);
      seen.add(row.externalId);
      row.isDuplicate = repeated;
      if (repeated) duplicates.push(row);
    }
    return duplicates;
  }

  private async uniqueExternalId(
    tx: { transaction: { findFirst(args: { where: { accountId: string; externalId: string } }): Promise<{ id: string } | null> } },
    accountId: string,
    externalId: string,
  ): Promise<string> {
    const exists = await tx.transaction.findFirst({ where: { accountId, externalId } });
    return exists ? `${externalId}#${randomUUID()}` : externalId;
  }

  private async assertAccount(
    householdId: string,
    householdMemberId: string,
    accountId: string,
  ): Promise<void> {
    await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, accountId);
  }

  private async assertCategories(
    householdId: string,
    rows: { categoryId: string; type: 'INCOME' | 'EXPENSE' }[],
  ): Promise<void> {
    const ids = [...new Set(rows.map((row) => row.categoryId))];
    const categories = await this.prisma.client.category.findMany({
      where: { householdId, id: { in: ids } },
      select: { id: true, type: true },
    });
    if (categories.length !== ids.length) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    const byId = new Map(categories.map((category) => [category.id, category.type]));
    for (const row of rows) {
      if (byId.get(row.categoryId) !== row.type) {
        throw new BadRequestException('A categoria não corresponde ao tipo do lançamento.');
      }
    }
  }

  private decisionStillValid(
    reconciliation: RowReconciliation | undefined,
    row: {
      action: string;
      transactionId?: string;
      billId?: string;
      isDuplicate: boolean;
    },
  ): boolean {
    if (row.action === 'IMPORT' || row.action === 'SKIP') return true;
    if (row.isDuplicate) return false;
    const matches = reconciliation?.matches ?? [];
    if (row.action === 'LINK_TRANSACTION') {
      return matches.some(
        (match) => match.kind !== 'BILL' && match.transactionId === row.transactionId,
      );
    }
    if (row.action === 'PAY_BILL') {
      return matches.some((match) => match.kind === 'BILL' && match.billId === row.billId);
    }
    return false;
  }

  private async reconciliationFor(
    householdId: string,
    householdMemberId: string,
    accountId: string,
    rows: StoredImportRow[],
  ) {
    const fresh = rows.filter((row) => !row.isDuplicate);
    if (fresh.length === 0) return new Map<string, RowReconciliation>();
    const accessible = await getAccessibleAccountIds(this.prisma.client, householdId, householdMemberId);
    if (!accessible.includes(accountId)) return new Map<string, RowReconciliation>();
    const dates = fresh.map((row) => utcDateKey(row.date));
    const earliest = dates.reduce((left, right) => (left < right ? left : right));
    const latest = dates.reduce((left, right) => (left > right ? left : right));
    const visible = new Set(accessible);
    const transactions = await this.prisma.client.transaction.findMany({
      where: {
        householdId,
        externalId: null,
        postingStatus: PostingStatus.POSTED,
        date: {
          gte: noonUtcFromKey(addDaysKey(earliest, -RECONCILE_TX_DAYS)),
          lte: noonUtcFromKey(addDaysKey(latest, RECONCILE_TX_DAYS)),
        },
        OR: [{ accountId }, { fromAccountId: accountId }, { toAccountId: accountId }],
      },
      include: { bill: { select: { id: true, description: true } } },
    });
    const bills = await this.prisma.client.bill.findMany({
      where: {
        householdId,
        status: BillStatus.PENDING,
        dueDate: {
          gte: noonUtcFromKey(addDaysKey(earliest, -BILL_MATCH_WIDE.before)),
          lte: noonUtcFromKey(addDaysKey(latest, BILL_MATCH_WIDE.after)),
        },
        AND: [
          { OR: [{ accountId: null }, { accountId }] },
          { OR: [{ targetAccountId: null }, { targetAccountId: { in: accessible } }] },
        ],
      },
    });
    const txCandidates: MatchTransactionCandidate[] = transactions.flatMap((row) => {
      const touched = [row.accountId, row.fromAccountId, row.toAccountId].filter(
        (id): id is string => Boolean(id),
      );
      if (touched.some((id) => !visible.has(id))) return [];
      return [
        {
          id: row.id,
          date: utcDateKey(row.date),
          amount: Number(row.amount),
          type: row.type,
          description: row.description,
          accountId: row.accountId,
          fromAccountId: row.fromAccountId,
          toAccountId: row.toAccountId,
          billId: row.bill?.id ?? null,
          billDescription: row.bill?.description ?? null,
        },
      ];
    });
    const billCandidates: MatchBillCandidate[] = bills
      .filter((row) => row.accountId === null || visible.has(row.accountId))
      .filter((row) => row.targetAccountId === null || visible.has(row.targetAccountId))
      .map((row) => ({
        id: row.id,
        description: row.description,
        dueDate: utcDateKey(row.dueDate),
        amount: Number(row.amount),
        targetAccountId: row.targetAccountId,
      }));
    const lines: MatchLine[] = fresh.map((row) => ({
      lineId: row.lineId,
      date: utcDateKey(row.date),
      amount: row.amount,
      direction: row.type === 'INCOME' ? 'in' : 'out',
      description: row.description,
    }));
    return matchImportRows(lines, txCandidates, billCandidates, accountId);
  }

  private async findOwnedBatch(householdId: string, householdMemberId: string, id: string) {
    const batch = await this.prisma.client.importBatch.findFirst({
      where: {
        id,
        householdId,
        OR: [{ accountId: null }, { account: accessibleAccountWhere(householdId, householdMemberId) }],
      },
    });
    if (!batch) {
      throw new NotFoundException('Importação não encontrada.');
    }
    return batch;
  }

  private async toPreview(
    batch: {
      id: string;
      fileName: string;
      format: string;
      source?: string;
      status: string;
      accountId: string | null;
      bankId?: string | null;
      acctId?: string | null;
      totalRows: number;
      importedRows: number;
      duplicateRows: number;
      createdAt: Date;
    },
    rows: StoredImportRow[],
    householdId: string,
    householdMemberId?: string,
  ) {
    const suggestions = await this.categoryMemory.suggestAll(
      householdId,
      rows.map((row) => row.description),
    );
    const reconciliation =
      batch.accountId === null || !householdMemberId
        ? new Map<string, RowReconciliation>()
        : await this.reconciliationFor(householdId, householdMemberId, batch.accountId, rows);
    const previewRows = rows.map((row, index) => {
      const suggestion = suggestions[index] ?? null;
      return {
        lineId: row.lineId,
        externalId: row.externalId,
        date: row.date.toISOString(),
        description: row.description,
        amount: moneyString(toDecimal(row.amount)),
        type: row.type,
        suggestedCategoryId: suggestion?.categoryId ?? null,
        confidence: suggestion?.confidence ?? null,
        suggestionSource: suggestion?.source ?? null,
        isDuplicate: row.isDuplicate,
        reconciliation: row.isDuplicate
          ? { matches: [], suggestedAction: 'SKIP' as const }
          : (reconciliation.get(row.lineId) ?? { matches: [], suggestedAction: 'IMPORT' as const }),
      };
    });

    return {
      id: batch.id,
      fileName: batch.fileName,
      format: batch.format,
      source: batch.source ?? ImportSource.MANUAL,
      status: batch.status,
      accountId: batch.accountId,
      bankId: batch.bankId ?? null,
      acctId: batch.acctId ?? null,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      duplicateRows: previewRows.filter((row) => row.isDuplicate).length,
      createdAt: batch.createdAt.toISOString(),
      rows: previewRows,
    };
  }
}
