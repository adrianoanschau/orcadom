import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@orcadom/database';
import type { CreateTransactionDto, ListTransactionsQuery } from '@orcadom/types';
import { applyBalance } from '../../common/balance.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { monthFromDate, type BudgetStatus } from '../budgets/budget-progress.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryMemory: CategoryMemoryService,
    private readonly budgetEvents: BudgetEventsService,
  ) {}

  async create(userId: string, dto: CreateTransactionDto) {
    await this.assertReferences(userId, dto);
    const date = new Date(dto.date);
    const previous =
      dto.type === TransactionType.EXPENSE
        ? await this.budgetEvents.snapshot(userId, dto.categoryId, date)
        : null;
    const created = await this.prisma.client.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({ data: this.toData(userId, dto) });
      await applyBalance(tx, transaction, 1);
      if (transaction.categoryId && transaction.type !== TransactionType.TRANSFER) {
        await this.categoryMemory.upsert(userId, transaction.description, transaction.categoryId, tx);
      }
      return transaction;
    });
    if (dto.type === TransactionType.EXPENSE) {
      await this.budgetEvents.emitIfCrossed(userId, dto.categoryId, date, previous?.status);
    }
    return this.toResponse(created);
  }

  async list(userId: string, query: ListTransactionsQuery) {
    const where = {
      userId,
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

  async update(userId: string, id: string, dto: CreateTransactionDto) {
    const current = await this.findOwned(userId, id);
    await this.assertReferences(userId, dto);
    const nextDate = new Date(dto.date);
    const previousByKey = await this.snapshotExpenseKeys(userId, [
      current.type === TransactionType.EXPENSE && current.categoryId
        ? { categoryId: current.categoryId, date: current.date }
        : null,
      dto.type === TransactionType.EXPENSE && dto.categoryId
        ? { categoryId: dto.categoryId, date: nextDate }
        : null,
    ]);
    const updated = await this.prisma.client.$transaction(async (tx) => {
      await applyBalance(tx, current, -1);
      const transaction = await tx.transaction.update({
        where: { id },
        data: this.toData(userId, dto),
      });
      await applyBalance(tx, transaction, 1);
      if (transaction.categoryId && transaction.type !== TransactionType.TRANSFER) {
        await this.categoryMemory.upsert(userId, transaction.description, transaction.categoryId, tx);
      }
      return transaction;
    });
    await this.emitExpenseKeys(userId, previousByKey);
    return this.toResponse(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const current = await this.findOwned(userId, id);
    await this.prisma.client.$transaction(async (tx) => {
      await applyBalance(tx, current, -1);
      await tx.transaction.delete({ where: { id } });
    });
  }

  private async snapshotExpenseKeys(
    userId: string,
    candidates: ({ categoryId: string; date: Date } | null)[],
  ) {
    const previousByKey = new Map<string, { categoryId: string; date: Date; status: BudgetStatus | null }>();
    for (const candidate of candidates) {
      if (!candidate) continue;
      const key = `${candidate.categoryId}:${monthFromDate(candidate.date)}`;
      if (previousByKey.has(key)) continue;
      const snapshot = await this.budgetEvents.snapshot(userId, candidate.categoryId, candidate.date);
      previousByKey.set(key, {
        categoryId: candidate.categoryId,
        date: candidate.date,
        status: snapshot?.status ?? null,
      });
    }
    return previousByKey;
  }

  private async emitExpenseKeys(
    userId: string,
    previousByKey: Map<string, { categoryId: string; date: Date; status: BudgetStatus | null }>,
  ): Promise<void> {
    for (const item of previousByKey.values()) {
      await this.budgetEvents.emitIfCrossed(userId, item.categoryId, item.date, item.status);
    }
  }

  private async assertReferences(userId: string, dto: CreateTransactionDto): Promise<void> {
    if (dto.type === 'TRANSFER') {
      await this.assertAccounts(userId, [dto.fromAccountId, dto.toAccountId]);
      return;
    }
    await this.assertAccounts(userId, [dto.accountId]);
    const category = await this.prisma.client.category.findFirst({
      where: { id: dto.categoryId, userId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (category.type !== dto.type) {
      throw new BadRequestException('A categoria não corresponde ao tipo do lançamento.');
    }
  }

  private async assertAccounts(userId: string, ids: (string | undefined)[]): Promise<void> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const found = await this.prisma.client.account.findMany({
      where: { userId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException('Conta não encontrada.');
    }
  }

  private toData(userId: string, dto: CreateTransactionDto) {
    const transfer = dto.type === TransactionType.TRANSFER;
    return {
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

  private async findOwned(userId: string, id: string) {
    const transaction = await this.prisma.client.transaction.findFirst({ where: { id, userId } });
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
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }
}
