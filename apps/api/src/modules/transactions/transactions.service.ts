import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostingStatus, TransactionType } from '@orcadom/database';
import type { CreateTransactionDto, ListTransactionsQuery } from '@orcadom/types';
import { applyBalance } from '../../common/balance.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { monthFromDate, type BudgetStatus } from '../budgets/budget-progress.js';
import { SavingsGoalsService } from '../savings-goals/savings-goals.service.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryMemory: CategoryMemoryService,
    private readonly budgetEvents: BudgetEventsService,
    private readonly savingsGoals: SavingsGoalsService,
  ) {}

  async create(householdId: string, userId: string, dto: CreateTransactionDto) {
    await this.assertReferences(householdId, dto);
    const date = new Date(dto.date);
    const previous =
      dto.type === TransactionType.EXPENSE
        ? await this.budgetEvents.snapshot(householdId, dto.categoryId, date)
        : null;
    const created = await this.prisma.client.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({ data: this.toData(householdId, userId, dto) });
      await applyBalance(tx, transaction, 1);
      if (transaction.categoryId && transaction.type !== TransactionType.TRANSFER) {
        await this.categoryMemory.upsert(householdId, transaction.description, transaction.categoryId, tx);
      }
      return transaction;
    });
    if (dto.type === TransactionType.EXPENSE) {
      await this.budgetEvents.emitIfCrossed(householdId, dto.categoryId, date, previous?.status);
    }
    if (dto.type === TransactionType.TRANSFER) {
      await this.savingsGoals.completeIfReached(householdId, dto.toAccountId);
    }
    return this.toResponse(created);
  }

  async list(householdId: string, query: ListTransactionsQuery) {
    const where = {
      householdId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.accountId
        ? {
            OR: [
              { accountId: query.accountId },
              { fromAccountId: query.accountId },
              { toAccountId: query.accountId },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.transaction.count({ where }),
      this.prisma.client.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async update(householdId: string, id: string, dto: CreateTransactionDto) {
    const current = await this.findOwned(householdId, id);
    await this.assertReferences(householdId, dto);
    const nextDate = new Date(dto.date);
    const previousByKey = await this.snapshotExpenseKeys(householdId, [
      current.type === TransactionType.EXPENSE && current.categoryId
        ? { categoryId: current.categoryId, date: current.date }
        : null,
      dto.type === TransactionType.EXPENSE && dto.categoryId
        ? { categoryId: dto.categoryId, date: nextDate }
        : null,
    ]);
    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (current.postingStatus !== PostingStatus.SCHEDULED) {
        await applyBalance(tx, current, -1);
      }
      const transaction = await tx.transaction.update({
        where: { id },
        data: this.toData(householdId, current.userId, dto),
      });
      if (current.postingStatus !== PostingStatus.SCHEDULED) {
        await applyBalance(tx, transaction, 1);
      }
      if (transaction.categoryId && transaction.type !== TransactionType.TRANSFER) {
        await this.categoryMemory.upsert(householdId, transaction.description, transaction.categoryId, tx);
      }
      return transaction;
    });
    await this.emitExpenseKeys(householdId, previousByKey);
    if (dto.type === TransactionType.TRANSFER) {
      await this.savingsGoals.completeIfReached(householdId, dto.toAccountId);
    }
    return this.toResponse(updated);
  }

  async remove(householdId: string, id: string): Promise<void> {
    const current = await this.findOwned(householdId, id);
    await this.prisma.client.$transaction(async (tx) => {
      if (current.postingStatus !== PostingStatus.SCHEDULED) {
        await applyBalance(tx, current, -1);
      }
      await tx.transaction.delete({ where: { id } });
    });
  }

  private async snapshotExpenseKeys(
    householdId: string,
    candidates: ({ categoryId: string; date: Date } | null)[],
  ) {
    const previousByKey = new Map<string, { categoryId: string; date: Date; status: BudgetStatus | null }>();
    for (const candidate of candidates) {
      if (!candidate) continue;
      const key = `${candidate.categoryId}:${monthFromDate(candidate.date)}`;
      if (previousByKey.has(key)) continue;
      const snapshot = await this.budgetEvents.snapshot(householdId, candidate.categoryId, candidate.date);
      previousByKey.set(key, {
        categoryId: candidate.categoryId,
        date: candidate.date,
        status: snapshot?.status ?? null,
      });
    }
    return previousByKey;
  }

  private async emitExpenseKeys(
    householdId: string,
    previousByKey: Map<string, { categoryId: string; date: Date; status: BudgetStatus | null }>,
  ): Promise<void> {
    for (const item of previousByKey.values()) {
      await this.budgetEvents.emitIfCrossed(householdId, item.categoryId, item.date, item.status);
    }
  }

  private async assertReferences(householdId: string, dto: CreateTransactionDto): Promise<void> {
    if (dto.type === 'TRANSFER') {
      await this.assertAccounts(householdId, [dto.fromAccountId, dto.toAccountId]);
      return;
    }
    await this.assertAccounts(householdId, [dto.accountId]);
    const category = await this.prisma.client.category.findFirst({
      where: { id: dto.categoryId, householdId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (category.type !== dto.type) {
      throw new BadRequestException('A categoria não corresponde ao tipo do lançamento.');
    }
  }

  private async assertAccounts(householdId: string, ids: (string | undefined)[]): Promise<void> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const found = await this.prisma.client.account.findMany({
      where: { householdId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException('Conta não encontrada.');
    }
  }

  private toData(householdId: string, userId: string, dto: CreateTransactionDto) {
    const transfer = dto.type === TransactionType.TRANSFER;
    return {
      householdId,
      userId,
      description: dto.description,
      amount: toDecimal(dto.amount),
      type: dto.type,
      date: new Date(dto.date),
      accountId: transfer ? null : (dto.accountId ?? null),
      categoryId: transfer ? null : (dto.categoryId ?? null),
      fromAccountId: transfer ? (dto.fromAccountId ?? null) : null,
      toAccountId: transfer ? (dto.toAccountId ?? null) : null,
    };
  }

  private async findOwned(householdId: string, id: string) {
    const transaction = await this.prisma.client.transaction.findFirst({
      where: { id, householdId },
    });
    if (!transaction) {
      throw new NotFoundException('Lançamento não encontrado.');
    }
    return transaction;
  }

  private toResponse(transaction: {
    id: string;
    description: string;
    amount: { toFixed(digits: number): string };
    type: string;
    date: Date;
    accountId: string | null;
    categoryId: string | null;
    fromAccountId: string | null;
    toAccountId: string | null;
    source?: string;
    externalId?: string | null;
    postingStatus?: string;
    installmentPlanId?: string | null;
    installmentNumber?: number | null;
    recurringTransactionId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: transaction.id,
      description: transaction.description,
      amount: moneyString(transaction.amount),
      type: transaction.type,
      date: transaction.date.toISOString(),
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      fromAccountId: transaction.fromAccountId,
      toAccountId: transaction.toAccountId,
      source: transaction.source ?? 'MANUAL',
      externalId: transaction.externalId ?? null,
      postingStatus: transaction.postingStatus ?? 'POSTED',
      installmentPlanId: transaction.installmentPlanId ?? null,
      installmentNumber: transaction.installmentNumber ?? null,
      recurringTransactionId: transaction.recurringTransactionId ?? null,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }
}
