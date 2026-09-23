import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportStatus, TransactionSource } from '@orcadom/database';
import type { ConfirmImportDto } from '@orcadom/types';
import { randomUUID } from 'node:crypto';
import { applyBalance } from '../../common/balance.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ImportPreviewStore, type StoredImportRow } from './import-preview.store.js';
import { parseCsv } from './parsers/csv.js';
import { parseOfx } from './parsers/ofx.js';
import { decodeStatementText, detectFormat, type ParsedStatementRow } from './parsers/shared.js';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ImportPreviewStore,
    private readonly categoryMemory: CategoryMemoryService,
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

    const rows: StoredImportRow[] = parsed.map((row) => ({
      ...row,
      lineId: randomUUID(),
      isDuplicate: false,
    }));
    const batch = await this.prisma.client.importBatch.create({
      data: {
        userId,
        accountId,
        fileName: file.originalname || `extrato.${format.toLowerCase()}`,
        format,
        totalRows: rows.length,
        duplicateRows: (await this.markDuplicates(userId, accountId, rows)).length,
      },
    });

    this.store.set(batch.id, {
      userId,
      accountId,
      fileName: batch.fileName,
      format,
      rows,
    });

    return this.toPreview(batch, rows, userId);
  }

  async preview(userId: string, batchId: string) {
    const batch = await this.findOwnedBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.store.get(batchId);
    if (stored?.userId !== userId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }
    await this.markDuplicates(userId, stored.accountId, stored.rows);
    return this.toPreview(batch, stored.rows, userId);
  }

  async confirm(userId: string, batchId: string, dto: ConfirmImportDto) {
    const batch = await this.findOwnedBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    const stored = this.store.get(batchId);
    if (stored?.userId !== userId) {
      throw new GoneException('A prévia expirou. Envie o arquivo novamente.');
    }
    await this.assertAccount(userId, stored.accountId);

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

    const imported = await this.prisma.client.$transaction(async (tx) => {
      let count = 0;
      for (const row of selected) {
        const externalId = await this.uniqueExternalId(tx, stored.accountId, row.externalId);
        const transaction = await tx.transaction.create({
          data: {
            userId,
            accountId: stored.accountId,
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
          status: ImportStatus.CONFIRMED,
          importedRows: count,
          confirmedAt: new Date(),
        },
      });
      return count;
    });

    this.store.delete(batchId);
    return {
      id: batch.id,
      accountId: stored.accountId,
      importedRows: imported,
      skippedRows: stored.rows.length - imported,
    };
  }

  async discard(userId: string, batchId: string): Promise<void> {
    const batch = await this.findOwnedBatch(userId, batchId);
    if (batch.status !== ImportStatus.PENDING) {
      throw new BadRequestException('Este lote já foi encerrado.');
    }
    await this.prisma.client.importBatch.update({
      where: { id: batch.id },
      data: { status: ImportStatus.DISCARDED },
    });
    this.store.delete(batchId);
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
      status: string;
      accountId: string;
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
      status: batch.status,
      accountId: batch.accountId,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      duplicateRows: previewRows.filter((row) => row.isDuplicate).length,
      createdAt: batch.createdAt.toISOString(),
      rows: previewRows,
    };
  }
}
