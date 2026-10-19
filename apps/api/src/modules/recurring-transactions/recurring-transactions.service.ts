import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountType, HouseholdRole, PostingStatus, Prisma, RecurrenceMode, TransactionType } from '@orcadom/database';
import type {
  CreateRecurringTransactionDto,
  UpdateRecurringTransactionDto,
} from '@orcadom/types';
import { accessibleAccountWhere, assertAccountAccessible } from '../../common/account-access.js';
import { captureJobItemError, runObservedJob } from '../../common/observability/run-observed-job.js';
import { addDaysKey, BILL_GENERATION_HORIZON_DAYS, noonUtcFromKey, todayKeyInSaoPaulo } from '../../common/calendar.js';
import { applyBalance } from '../../common/balance.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { isDueOnOrBefore } from '../installment-plans/generate-installments.js';
import {
  calculateNextOccurrenceDate,
  occurrenceDatesUntil,
  recurrenceHorizon,
  type RecurrenceRule,
} from './recurrence.js';

@Injectable()
export class RecurringTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetEvents: BudgetEventsService,
  ) {}

  async create(householdId: string, householdMemberId: string, dto: CreateRecurringTransactionDto) {
    const mode = dto.mode ?? 'AUTO_POST';
    await this.assertAccount(householdId, householdMemberId, dto.accountId);
    if (dto.targetAccountId) {
      await this.assertAccount(householdId, householdMemberId, dto.targetAccountId);
      await this.assertCard(householdId, dto.targetAccountId);
    }
    if (dto.categoryId) await this.assertCategory(householdId, dto.categoryId, dto.type);
    const startDate = new Date(dto.startDate);
    const created = await this.prisma.client.recurringTransaction.create({
      data: {
        householdId,
        description: dto.description,
        amount: toDecimal(dto.amount),
        type: dto.type,
        frequency: dto.frequency,
        dayOfMonth: dto.frequency === 'MONTHLY' ? (dto.dayOfMonth ?? startDate.getUTCDate()) : null,
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        accountId: dto.accountId,
        categoryId: dto.targetAccountId ? null : (dto.categoryId ?? null),
        mode,
        targetAccountId: dto.targetAccountId ?? null,
      },
    });
    await this.generateFor(created.id);
    return this.get(householdId, householdMemberId, created.id);
  }

  async list(householdId: string, householdMemberId: string) {
    const rows = await this.prisma.client.recurringTransaction.findMany({
      where: { householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
        targetAccount: { select: { name: true } },
        occurrences: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
        bills: { select: { dueDate: true }, orderBy: { dueDate: 'desc' }, take: 1 },
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(householdId: string, householdMemberId: string, id: string) {
    const row = await this.findOwned(householdId, householdMemberId, id);
    return this.toResponse(row);
  }

  async update(
    householdId: string,
    householdMemberId: string,
    id: string,
    dto: UpdateRecurringTransactionDto,
  ) {
    const current = await this.findOwned(householdId, householdMemberId, id);
    if (dto.accountId) await this.assertAccount(householdId, householdMemberId, dto.accountId);
    if (dto.categoryId) await this.assertCategory(householdId, dto.categoryId, current.type);
    await this.prisma.client.recurringTransaction.update({
      where: { id: current.id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount !== undefined ? { amount: toDecimal(dto.amount) } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.dayOfMonth !== undefined ? { dayOfMonth: dto.dayOfMonth } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
        ...(dto.targetAccountId !== undefined ? { targetAccountId: dto.targetAccountId } : {}),
      },
    });
    return this.get(householdId, householdMemberId, id);
  }

  async pause(householdId: string, householdMemberId: string, id: string) {
    await this.findOwned(householdId, householdMemberId, id);
    await this.prisma.client.recurringTransaction.update({
      where: { id },
      data: { active: false },
    });
    return this.get(householdId, householdMemberId, id);
  }

  async resume(householdId: string, householdMemberId: string, id: string) {
    await this.findOwned(householdId, householdMemberId, id);
    await this.prisma.client.recurringTransaction.update({
      where: { id },
      data: { active: true },
    });
    await this.generateFor(id);
    return this.get(householdId, householdMemberId, id);
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    const current = await this.findOwned(householdId, householdMemberId, id);
    if (current.mode === RecurrenceMode.BILL) {
      const today = noonUtcFromKey(todayKeyInSaoPaulo());
      await this.prisma.client.$transaction(async (tx) => {
        await tx.bill.updateMany({
          where: {
            recurringTransactionId: current.id,
            status: 'PENDING',
            dueDate: { gt: today },
          },
          data: { status: 'CANCELED' },
        });
        await tx.recurringTransaction.update({
          where: { id: current.id },
          data: { active: false },
        });
      });
      return;
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.transaction.deleteMany({
        where: {
          recurringTransactionId: current.id,
          postingStatus: PostingStatus.SCHEDULED,
        },
      });
      await tx.recurringTransaction.delete({ where: { id: current.id } });
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'America/Sao_Paulo' })
  async generateDueRecurringOccurrences(): Promise<number> {
    return runObservedJob('recurring_generate', 'CRON_RECURRING', async () => {
      const horizon = noonUtcFromKey(addDaysKey(todayKeyInSaoPaulo(), BILL_GENERATION_HORIZON_DAYS));
      const active = await this.prisma.client.recurringTransaction.findMany({
        where: {
          active: true,
          startDate: { lte: horizon },
          OR: [{ endDate: null }, { endDate: { gte: startOfToday() } }],
        },
      });
      let created = 0;
      for (const row of active) {
        try {
          created += await this.generateFor(row.id);
        } catch (error) {
          captureJobItemError('recurring_generate', error, row.id);
        }
      }
      return created;
    });
  }

  private async generateFor(id: string): Promise<number> {
    const recurring = await this.prisma.client.recurringTransaction.findUnique({
      where: { id },
      include: {
        occurrences: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
        bills: { select: { dueDate: true }, orderBy: { dueDate: 'desc' }, take: 1 },
      },
    });
    if (!recurring?.active) return 0;
    if (recurring.mode === RecurrenceMode.BILL) return this.generateBills(recurring);

    const last = recurring.occurrences[0]?.date ?? null;
    const dates = occurrenceDatesUntil(toRule(recurring), last, recurrenceHorizon());
    const recorderId = await this.recorderUserId(recurring.householdId);
    let created = 0;

    for (const date of dates) {
      const posted = isDueOnOrBefore(date);
      const previous =
        posted && recurring.type === TransactionType.EXPENSE
          ? await this.budgetEvents.snapshot(recurring.householdId, recurring.categoryId, date)
          : null;
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const transaction = await tx.transaction.create({
            data: {
              householdId: recurring.householdId,
              userId: recorderId,
              accountId: recurring.accountId,
              categoryId: recurring.categoryId,
              description: recurring.description,
              amount: recurring.amount,
              type: recurring.type,
              date,
              recurringTransactionId: recurring.id,
              postingStatus: posted ? PostingStatus.POSTED : PostingStatus.SCHEDULED,
            },
          });
          if (posted) {
            await applyBalance(tx, transaction, 1);
          }
        });
        created += 1;
        if (posted && recurring.type === TransactionType.EXPENSE) {
          await this.budgetEvents.emitIfCrossed(
            recurring.householdId,
            recurring.categoryId,
            date,
            previous,
          );
        }
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        captureJobItemError('recurring_generate', error, recurring.id);
      }
    }
    return created;
  }

  private async generateBills(recurring: {
    id: string;
    householdId: string;
    description: string;
    amount: Prisma.Decimal;
    accountId: string;
    categoryId: string | null;
    targetAccountId: string | null;
    endDate: Date | null;
    frequency: string;
    dayOfMonth: number | null;
    startDate: Date;
    bills: { dueDate: Date }[];
  }): Promise<number> {
    const horizon = noonUtcFromKey(addDaysKey(todayKeyInSaoPaulo(), BILL_GENERATION_HORIZON_DAYS));
    const last = recurring.bills[0]?.dueDate ?? null;
    const dates = occurrenceDatesUntil(toRule(recurring), last, horizon);
    let created = 0;
    for (const dueDate of dates) {
      try {
        await this.prisma.client.bill.create({
          data: {
            householdId: recurring.householdId,
            description: recurring.description,
            amount: recurring.amount,
            dueDate,
            accountId: recurring.accountId,
            categoryId: recurring.categoryId,
            targetAccountId: recurring.targetAccountId,
            recurringTransactionId: recurring.id,
          },
        });
        created += 1;
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        captureJobItemError('recurring_generate', error, recurring.id);
      }
    }
    return created;
  }

  private async findOwned(householdId: string, householdMemberId: string, id: string) {
    const row = await this.prisma.client.recurringTransaction.findFirst({
      where: { id, householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
        occurrences: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
        bills: { select: { dueDate: true }, orderBy: { dueDate: 'desc' }, take: 1 },
        targetAccount: { select: { name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Recorrência não encontrada.');
    }
    return row;
  }

  private async recorderUserId(householdId: string): Promise<string> {
    const owner = await this.prisma.client.householdMember.findFirst({
      where: { householdId, role: HouseholdRole.OWNER },
      orderBy: { joinedAt: 'asc' },
    });
    if (!owner) {
      throw new NotFoundException('Espaço sem responsável.');
    }
    return owner.userId;
  }

  private async assertAccount(
    householdId: string,
    householdMemberId: string,
    accountId: string,
  ): Promise<void> {
    await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, accountId);
  }

  private async assertCard(householdId: string, accountId: string): Promise<void> {
    const account = await this.prisma.client.account.findFirst({ where: { id: accountId, householdId } });
    if (account?.type !== AccountType.CREDIT_CARD) {
      throw new BadRequestException('A fatura precisa apontar para uma conta de cartão.');
    }
  }

  private async assertCategory(householdId: string, categoryId: string, type: string): Promise<void> {
    const category = await this.prisma.client.category.findFirst({ where: { id: categoryId, householdId } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (category.type !== type) {
      throw new BadRequestException('A categoria não corresponde ao tipo da recorrência.');
    }
  }

  private toResponse(row: {
    id: string;
    description: string;
    amount: { toFixed(digits: number): string };
    type: string;
    frequency: string;
    dayOfMonth: number | null;
    startDate: Date;
    endDate: Date | null;
    active: boolean;
    accountId: string;
    categoryId: string | null;
    mode: string;
    targetAccountId: string | null;
    account: { name: string };
    category: { name: string } | null;
    targetAccount?: { name: string } | null;
    occurrences: { date: Date }[];
    bills?: { dueDate: Date }[];
  }) {
    const last =
      row.mode === 'BILL' ? (row.bills?.[0]?.dueDate ?? null) : (row.occurrences[0]?.date ?? null);
    const computed = last && last.getTime() > Date.now() ? last : calculateNextOccurrenceDate(toRule(row), last);
    const ended = row.endDate ? startOfToday().getTime() > startOfUtcDaySafe(row.endDate) : false;
    const nextOccurrence =
      !row.active || ended || (row.endDate && computed.getTime() > row.endDate.getTime())
        ? null
        : computed.toISOString();
    return {
      id: row.id,
      description: row.description,
      amount: moneyString(row.amount),
      type: row.type,
      frequency: row.frequency,
      dayOfMonth: row.dayOfMonth,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate?.toISOString() ?? null,
      active: row.active,
      accountId: row.accountId,
      accountName: row.account.name,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      mode: row.mode,
      targetAccountId: row.targetAccountId,
      targetAccountName: row.targetAccount?.name ?? null,
      nextOccurrence,
    };
  }
}

function toRule(row: {
  frequency: string;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
}): RecurrenceRule {
  return {
    frequency: row.frequency as RecurrenceRule['frequency'],
    dayOfMonth: row.dayOfMonth,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcDaySafe(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
