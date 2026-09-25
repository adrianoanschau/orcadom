import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportSource, ImportStatus, Prisma, TransactionSource } from '@orcadom/database';
import type { ConfirmImportDto } from '@orcadom/types';
import { randomUUID } from 'node:crypto';
import { applyBalance } from '../../common/balance.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { monthFromDate, type BudgetStatus } from '../budgets/budget-progress.js';
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
import { decodeStatementText, detectFormat, type ParsedStatementRow } from './parsers/shared.js';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface CreatePendingBatchInput {
  userId: string;
  accountId: string | null;
  fileName: string;
  format: 'OFX' | 'CSV';
  source: ImportSource;
  status: ImportStatus;
  bankId?: string | null;
  acctId?: string | null;
  rows: ParsedStatementRow[];
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ImportPreviewStore,
    private readonly categoryMemory: CategoryMemoryService,
    private readonly budgetEvents: BudgetEventsService,
  ) {}

  async upload(userId: string, accountId: string, file: UploadedFile | undefined) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Envie um arquivo OFX ou CSV.');
    }
    await this.assertAccount(userId, accountId);

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
      userId,
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
      ? (await this.markDuplicates(input.userId, input.accountId, rows)).length
      : 0;

    const batch = await this.prisma.client.importBatch.create({
      data: {
        userId: input.userId,
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
      userId: input.userId,
      accountId: input.accountId,
      fileName: batch.fileName,
      format: input.format,
      bankId: input.bankId ?? null,
      acctId: input.acctId ?? null,
      rows,
    });

    return this.toPreview(batch, rows, input.userId);
  }

  async listOpen(userId: string) {
    const batches = await this.prisma.client.importBatch.findMany({
      where: {
        userId,
        status: { in: [ImportStatus.PENDING, ImportStatus.UNMAPPED_ACCOUNT] },
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

  async preview(userId: string, batchId: string) {
    const batch = await this.findOwnedBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.UNMAPPED_ACCOUNT) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.loadPreview(batch);
    if (stored?.userId !== userId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }
    if (stored.accountId) {
      await this.markDuplicates(userId, stored.accountId, stored.rows);
    }
    return this.toPreview(batch, stored.rows, userId);
  }

  async confirm(userId: string, batchId: string, dto: ConfirmImportDto) {
    const batch = await this.findOwnedBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING && batch.status !== ImportStatus.UNMAPPED_ACCOUNT) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.loadPreview(batch);
    if (stored?.userId !== userId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }

    const accountId = dto.accountId ?? stored.accountId ?? batch.accountId;
    if (!accountId) {
      throw new BadRequestException('Selecione a conta deste extrato antes de confirmar.');
    }
    await this.assertAccount(userId, accountId);

    if (batch.bankId && batch.acctId) {
      await this.prisma.client.bankAccountMapping.upsert({
        where: {
          userId_bankId_acctId: { userId, bankId: batch.bankId, acctId: batch.acctId },
        },
        update: { accountId },
        create: { userId, bankId: batch.bankId, acctId: batch.acctId, accountId },
      });
    }

    const byLineId = new Map(stored.rows.map((row) => [row.lineId, row]));
    const selected = dto.rows.map((row) => {
      const storedRow = byLineId.get(row.lineId);
      if (!storedRow) {
        throw new BadRequestException('Uma das linhas da prévia não foi encontrada.');
      }
      return { ...storedRow, categoryId: row.categoryId };
    });

    await this.assertCategories(
      userId,
      selected.map((row) => ({ categoryId: row.categoryId, type: row.type })),
    );

    const previousByKey = new Map<string, { categoryId: string; date: Date; status: BudgetStatus | null }>();
    for (const row of selected) {
      if (row.type !== 'EXPENSE') continue;
      const key = `${row.categoryId}:${monthFromDate(row.date)}`;
      if (previousByKey.has(key)) continue;
      const snapshot = await this.budgetEvents.snapshot(userId, row.categoryId, row.date);
      previousByKey.set(key, {
        categoryId: row.categoryId,
        date: row.date,
        status: snapshot?.status ?? null,
      });
    }

    const imported = await this.prisma.client.$transaction(async (tx) => {
      let count = 0;
      for (const row of selected) {
        const externalId = await this.uniqueExternalId(tx, accountId, row.externalId);
        const transaction = await tx.transaction.create({
          data: {
            userId,
            accountId,
            importBatchId: batch.id,
            source: TransactionSource.IMPORTED,
            externalId,
            description: row.description,
            amount: toDecimal(row.amount),
            type: row.type,
            date: row.date,
            categoryId: row.categoryId,
          },
        });
        await applyBalance(tx, transaction, 1);
        await this.categoryMemory.upsert(userId, transaction.description, row.categoryId, tx);
        count += 1;
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          accountId,
          status: ImportStatus.CONFIRMED,
          importedRows: count,
          confirmedAt: new Date(),
          preview: Prisma.DbNull,
        },
      });
      return count;
    });

    this.store.delete(batchId);
    for (const item of previousByKey.values()) {
      await this.budgetEvents.emitIfCrossed(userId, item.categoryId, item.date, item.status);
    }
    return {
      id: batch.id,
      accountId,
      importedRows: imported,
      skippedRows: stored.rows.length - imported,
    };
  }

  async discard(userId: string, batchId: string): Promise<void> {
    const batch = await this.findOwnedBatch(userId, batchId);
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
    userId: string;
    accountId: string | null;
    fileName: string;
    format: 'OFX' | 'CSV';
    bankId: string | null;
    acctId: string | null;
    preview: unknown;
  }): StoredImportPreview | null {
    const cached = this.store.get(batch.id);
    if (cached?.userId === batch.userId) return cached;
    if (!Array.isArray(batch.preview)) return null;

    const rows = hydratePreviewRows(batch.preview as SerializedImportRow[]);
    const payload: StoredImportPreview = {
      userId: batch.userId,
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
    userId: string,
    accountId: string,
    rows: StoredImportRow[],
  ): Promise<StoredImportRow[]> {
    const existing = await this.prisma.client.transaction.findMany({
      where: {
        userId,
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

  private async assertAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.client.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
  }

  private async assertCategories(
    userId: string,
    rows: { categoryId: string; type: 'INCOME' | 'EXPENSE' }[],
  ): Promise<void> {
    const ids = [...new Set(rows.map((row) => row.categoryId))];
    const categories = await this.prisma.client.category.findMany({
      where: { userId, id: { in: ids } },
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

  private async findOwnedBatch(userId: string, id: string) {
    const batch = await this.prisma.client.importBatch.findFirst({ where: { id, userId } });
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
    userId: string,
  ) {
    const suggestions = await this.categoryMemory.suggestAll(
      userId,
      rows.map((row) => row.description),
    );
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
