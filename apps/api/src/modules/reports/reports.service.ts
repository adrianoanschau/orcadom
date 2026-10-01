import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ReportFormat, ReportStatus, TransactionType } from '@orcadom/database';
import { reportFiltersSchema, type CreateReportDto, type ReportFilters } from '@orcadom/types';
import { assertAccountAccessible, getAccessibleAccountIds } from '../../common/account-access.js';
import { categoryIdsForFilter } from '../../common/category-tree.js';
import { moneyString } from '../../common/money.js';
import { runObservedJob } from '../../common/observability/run-observed-job.js';
import { PrismaService } from '../../common/prisma.service.js';
import { buildTransactionListWhere } from '../../common/transaction-filters.js';
import type { ReportRow } from './report-document.js';
import { reportContentType, reportFileName } from './report-document.js';
import { ReportEventsService } from './report-events.service.js';
import { buildPdfReport } from './report-pdf.js';
import {
  isReportFileExpired,
  isReportStuck,
  REPORT_STUCK_MS,
  reportExpiresAt,
  shouldGenerateSync,
} from './report-policy.js';
import { defaultReportsDir, LocalReportStorage, type ReportStorage } from './report-storage.js';
import { buildXlsxReport } from './report-xlsx.js';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly storage: ReportStorage;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: ReportEventsService,
  ) {
    this.storage = new LocalReportStorage(defaultReportsDir(this.config.get<string>('REPORTS_DIR')));
  }

  async create(householdId: string, householdMemberId: string, userId: string, dto: CreateReportDto) {
    await this.assertFilters(householdId, householdMemberId, dto);
    const filters = this.toStoredFilters(dto);
    const accessibleIds = await getAccessibleAccountIds(
      this.prisma.client,
      householdId,
      householdMemberId,
    );
    const count = await this.prisma.client.transaction.count({
      where: await this.transactionWhere(householdId, filters, accessibleIds),
    });
    const created = await this.prisma.client.reportRequest.create({
      data: {
        format: dto.format,
        status: ReportStatus.PENDING,
        filters,
        householdId,
        requestedByUserId: userId,
      },
    });

    if (shouldGenerateSync(count)) {
      await this.processReport(created.id, { notify: false });
      return this.get(householdId, userId, created.id);
    }

    void this.processReport(created.id, { notify: true }).catch((error: unknown) => {
      this.logger.error(`Falha ao gerar relatório ${created.id}: ${errorMessage(error)}`);
    });
    return this.toResponse(created);
  }

  async list(householdId: string, userId: string) {
    const rows = await this.prisma.client.reportRequest.findMany({
      where: { householdId, requestedByUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(householdId: string, userId: string, id: string) {
    return this.toResponse(await this.findOwned(householdId, userId, id));
  }

  async download(householdId: string, userId: string, id: string) {
    const row = await this.findOwned(householdId, userId, id);
    if (row.status !== ReportStatus.READY || !row.filePath || isReportFileExpired(row.expiresAt)) {
      if (row.status === ReportStatus.READY) {
        throw new HttpException('Este relatório expirou.', HttpStatus.GONE);
      }
      throw new NotFoundException('Relatório ainda não está pronto.');
    }

    return {
      stream: await this.storage.read(row.filePath),
      fileName: reportFileName(row.format, row.completedAt ?? row.createdAt),
      contentType: reportContentType(row.format),
    };
  }

  async processReport(id: string, options: { notify: boolean }): Promise<void> {
    const claimed = await this.prisma.client.reportRequest.updateMany({
      where: { id, status: { in: [ReportStatus.PENDING, ReportStatus.PROCESSING] } },
      data: { status: ReportStatus.PROCESSING },
    });
    if (claimed.count === 0) return;

    const row = await this.prisma.client.reportRequest.findUnique({ where: { id } });
    if (!row) return;

    try {
      const filters = this.parseFilters(row.filters);
      const membership = await this.prisma.client.householdMember.findUnique({
        where: {
          userId_householdId: { userId: row.requestedByUserId, householdId: row.householdId },
        },
        select: { id: true },
      });
      const accessibleIds = membership
        ? await getAccessibleAccountIds(this.prisma.client, row.householdId, membership.id)
        : [];
      const where = await this.transactionWhere(row.householdId, filters, accessibleIds);
      const [household, account, category, transactions] = await Promise.all([
        this.prisma.client.household.findUnique({
          where: { id: row.householdId },
          select: { name: true },
        }),
        filters.accountId
          ? this.prisma.client.account.findFirst({
              where: { id: filters.accountId, householdId: row.householdId },
              select: { name: true },
            })
          : Promise.resolve(null),
        filters.categoryId
          ? this.prisma.client.category.findFirst({
              where: { id: filters.categoryId, householdId: row.householdId },
              select: { name: true },
            })
          : Promise.resolve(null),
        this.prisma.client.transaction.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          include: {
            account: { select: { name: true } },
            category: { select: { name: true } },
            fromAccount: { select: { name: true } },
            toAccount: { select: { name: true } },
          },
        }),
      ]);

      const visible = new Set(accessibleIds);
      const reportRows = transactions.map((transaction) => this.toReportRow(transaction, visible));
      const meta = {
        householdName: household?.name ?? 'Orcadom',
        generatedAt: new Date(),
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
        accountName: account?.name ?? undefined,
        categoryName: category?.name ?? undefined,
      };
      const buffer =
        row.format === ReportFormat.PDF
          ? await buildPdfReport(reportRows, meta)
          : await buildXlsxReport(reportRows, meta);
      const filePath = await this.storage.write(row.id, row.format, buffer);
      const completedAt = new Date();
      await this.prisma.client.reportRequest.update({
        where: { id: row.id },
        data: {
          status: ReportStatus.READY,
          filePath,
          completedAt,
          expiresAt: reportExpiresAt(completedAt),
        },
      });
      if (options.notify) {
        this.events.emitReady({
          householdId: row.householdId,
          reportId: row.id,
          requestedByUserId: row.requestedByUserId,
          format: row.format,
        });
      }
    } catch (error) {
      this.logger.error(`Geração do relatório ${id} falhou: ${errorMessage(error)}`);
      await this.prisma.client.reportRequest.update({
        where: { id },
        data: { status: ReportStatus.FAILED, completedAt: new Date() },
      });
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'America/Sao_Paulo' })
  async cleanupExpired(): Promise<number> {
    return runObservedJob('report_cleanup', 'SYSTEM', async () => {
      const expired = await this.prisma.client.reportRequest.findMany({
        where: { expiresAt: { lte: new Date() }, filePath: { not: null } },
        select: { id: true, filePath: true },
      });
      for (const row of expired) {
        if (row.filePath) await this.storage.delete(row.filePath);
        await this.prisma.client.reportRequest.update({
          where: { id: row.id },
          data: { filePath: null },
        });
      }
      if (expired.length > 0) {
        this.logger.log(`Removeu ${String(expired.length)} arquivo(s) de relatório expirado(s).`);
      }
      return expired.length;
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'America/Sao_Paulo' })
  async resumeStuck(): Promise<number> {
    return runObservedJob('report_resume', 'SYSTEM', async () => {
      const cutoff = new Date(Date.now() - REPORT_STUCK_MS);
      const stuck = await this.prisma.client.reportRequest.findMany({
        where: {
          status: { in: [ReportStatus.PENDING, ReportStatus.PROCESSING] },
          createdAt: { lte: cutoff },
        },
        select: { id: true, createdAt: true },
      });
      let resumed = 0;
      for (const row of stuck) {
        if (!isReportStuck(row.createdAt)) continue;
        await this.prisma.client.reportRequest.updateMany({
          where: { id: row.id, status: ReportStatus.PROCESSING },
          data: { status: ReportStatus.PENDING },
        });
        void this.processReport(row.id, { notify: true }).catch((error: unknown) => {
          this.logger.error(`Retomada do relatório ${row.id} falhou: ${errorMessage(error)}`);
        });
        resumed += 1;
      }
      return resumed;
    });
  }

  private async transactionWhere(
    householdId: string,
    filters: ReportFilters,
    accessibleIds: string[],
  ) {
    const categoryIds = await categoryIdsForFilter(
      this.prisma.client,
      householdId,
      filters.categoryId,
      filters.includeDescendants,
    );
    return buildTransactionListWhere(householdId, filters, accessibleIds, categoryIds);
  }

  private async assertFilters(
    householdId: string,
    householdMemberId: string,
    dto: CreateReportDto,
  ): Promise<void> {
    if (dto.accountId) {
      await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, dto.accountId);
    }
    if (dto.categoryId) {
      const category = await this.prisma.client.category.findFirst({
        where: { id: dto.categoryId, householdId },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada.');
    }
  }

  private async findOwned(householdId: string, userId: string, id: string) {
    const row = await this.prisma.client.reportRequest.findFirst({
      where: { id, householdId, requestedByUserId: userId },
    });
    if (!row) throw new NotFoundException('Relatório não encontrado.');
    return row;
  }

  private toStoredFilters(dto: CreateReportDto): ReportFilters {
    return {
      includeDescendants: dto.includeDescendants,
      ...(dto.accountId ? { accountId: dto.accountId } : {}),
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.from ? { from: dto.from } : {}),
      ...(dto.to ? { to: dto.to } : {}),
    };
  }

  private parseFilters(value: Prisma.JsonValue): ReportFilters {
    const parsed = reportFiltersSchema.safeParse(value);
    return parsed.success ? parsed.data : { includeDescendants: true };
  }

  private toReportRow(
    transaction: {
      accountId: string | null;
      fromAccountId: string | null;
      toAccountId: string | null;
      date: Date;
      description: string;
      type: string;
      amount: { toFixed(digits: number): string };
      account: { name: string } | null;
      category: { name: string } | null;
      fromAccount: { name: string } | null;
      toAccount: { name: string } | null;
    },
    accessibleIds: ReadonlySet<string>,
  ): ReportRow {
    const transfer = transaction.type === TransactionType.TRANSFER;
    const fromName = accessibleIds.has(transaction.fromAccountId ?? '')
      ? (transaction.fromAccount?.name ?? 'origem')
      : 'origem';
    const toName = accessibleIds.has(transaction.toAccountId ?? '')
      ? (transaction.toAccount?.name ?? 'destino')
      : 'destino';
    return {
      date: transaction.date,
      description: transaction.description,
      type: transaction.type as ReportRow['type'],
      amount: moneyString(transaction.amount),
      accountName: transfer
        ? `${fromName} → ${toName}`
        : accessibleIds.has(transaction.accountId ?? '')
          ? (transaction.account?.name ?? '—')
          : '—',
      categoryName: transaction.category?.name ?? '—',
    };
  }

  private toResponse(row: {
    id: string;
    format: string;
    status: string;
    filters: Prisma.JsonValue;
    filePath: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    const ready = row.status === ReportStatus.READY && Boolean(row.filePath) && !isReportFileExpired(row.expiresAt);
    return {
      id: row.id,
      format: row.format,
      status: row.status,
      filters: this.parseFilters(row.filters),
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      downloadUrl: ready ? `/reports/${row.id}/download` : null,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'falha desconhecida';
}
