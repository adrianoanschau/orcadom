import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostingStatus, Prisma, TransactionSource, TransactionType } from '@orcadom/database';
import type { CreateTransactionDto, ListTransactionsQuery } from '@orcadom/types';
import {
  assertAccountAccessible,
  getAccessibleAccountIds,
  redactInaccessibleAccountId,
  transactionTouchesAccessibleAccounts,
} from '../../common/account-access.js';
import { applyBalance } from '../../common/balance.js';
import { CategoryMemoryService } from '../../common/category-memory.service.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { categoryIdsForFilter } from '../../common/category-tree.js';
import { buildTransactionListWhere } from '../../common/transaction-filters.js';
import { BudgetEventsService, type BudgetSnapshot } from '../budgets/budget-events.service.js';
import { monthFromDate } from '../budgets/budget-progress.js';
import { SavingsGoalsService } from '../savings-goals/savings-goals.service.js';

export type TransactionWriter = Prisma.TransactionClient;

export interface TransactionWriteExtras {
  source?: 'MANUAL' | 'IMPORTED';
  externalId?: string | null;
  externalProvider?: string | null;
  importBatchId?: string | null;
  memorySource?: string;
  recurringTransactionId?: string;
  postingStatus?: 'POSTED' | 'SCHEDULED';
}

export type PendingDomainEvent =
  | {
      name: 'budget.threshold_crossed';
      householdId: string;
      categoryId: string;
      date: string;
      previous: BudgetSnapshot | null;
    }
  | {
      name: 'savings-goal.check';
      householdId: string;
      accountId: string;
    };

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryMemory: CategoryMemoryService,
    private readonly budgetEvents: BudgetEventsService,
    private readonly savingsGoals: SavingsGoalsService,
  ) {}

  async create(
    householdId: string,
    householdMemberId: string,
    userId: string,
    dto: CreateTransactionDto,
  ) {
    await this.assertReferences(householdId, householdMemberId, dto);
    const { transaction, events } = await this.prisma.client.$transaction((tx) =>
      this.createWithin(tx as Prisma.TransactionClient, householdId, userId, dto),
    );
    await this.flushEvents(events);
    return this.toResponse(transaction, new Set(await this.accessibleIds(householdId, householdMemberId)));
  }

  async createWithin(
    tx: TransactionWriter,
    householdId: string,
    userId: string,
    dto: CreateTransactionDto,
    extras: TransactionWriteExtras = {},
  ): Promise<{ transaction: Awaited<ReturnType<TransactionWriter['transaction']['create']>>; events: PendingDomainEvent[] }> {
    const date = new Date(dto.date);
    const previous =
      dto.type === TransactionType.EXPENSE
        ? await this.budgetEvents.snapshot(householdId, dto.categoryId, date)
        : null;
    const transaction = await tx.transaction.create({
      data: this.toData(householdId, userId, dto, extras),
    });
    if ((extras.postingStatus ?? PostingStatus.POSTED) !== PostingStatus.SCHEDULED) {
      await applyBalance(tx, transaction, 1);
    }
    const memoryDescription = extras.memorySource ?? transaction.description;
    if (transaction.categoryId && transaction.type !== TransactionType.TRANSFER) {
      await this.categoryMemory.upsert(householdId, memoryDescription, transaction.categoryId, tx);
    }
    return { transaction, events: this.pendingEvents(householdId, dto, date, previous) };
  }

  async flushEvents(events: readonly PendingDomainEvent[]): Promise<void> {
    const seen = new Set<string>();
    for (const event of events) {
      if (event.name === 'budget.threshold_crossed') {
        await this.budgetEvents.emitIfCrossed(
          event.householdId,
          event.categoryId,
          new Date(event.date),
          event.previous,
          seen,
        );
        continue;
      }
      await this.savingsGoals.completeIfReached(event.householdId, event.accountId);
    }
  }

  async list(householdId: string, householdMemberId: string, query: ListTransactionsQuery) {
    const accessibleIds = await this.accessibleIds(householdId, householdMemberId);
    const categoryIds = await categoryIdsForFilter(
      this.prisma.client,
      householdId,
      query.categoryId,
      query.includeDescendants,
    );
    const where = buildTransactionListWhere(householdId, query, accessibleIds, categoryIds);
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.transaction.count({ where }),
      this.prisma.client.transaction.findMany({
        where,
        include: { bill: { select: { id: true, settlement: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    const visible = new Set(accessibleIds);
    return {
      data: rows.map((row) => this.toResponse(row, visible)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async update(
    householdId: string,
    householdMemberId: string,
    id: string,
    dto: CreateTransactionDto,
  ) {
    const current = await this.findOwned(householdId, householdMemberId, id);
    const linkedBill = await this.prisma.client.bill.findFirst({
      where: { transactionId: current.id },
      select: { id: true },
    });
    if (linkedBill && dto.type !== current.type) {
      throw new BadRequestException('O tipo de um lançamento ligado a uma conta a pagar não pode mudar.');
    }
    await this.assertReferences(householdId, householdMemberId, dto);
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
    return this.toResponse(updated, new Set(await this.accessibleIds(householdId, householdMemberId)));
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    const current = await this.findOwned(householdId, householdMemberId, id);
    const { events } = await this.prisma.client.$transaction((tx) =>
      this.deleteWithin(tx as Prisma.TransactionClient, current),
    );
    await this.flushEvents(events);
  }

  async deleteWithin(
    tx: TransactionWriter,
    current: {
      id: string;
      householdId: string;
      type: string;
      amount: Prisma.Decimal;
      date: Date;
      accountId: string | null;
      categoryId: string | null;
      fromAccountId: string | null;
      toAccountId: string | null;
      postingStatus: string;
    },
  ): Promise<{ events: PendingDomainEvent[] }> {
    const previous =
      current.type === TransactionType.EXPENSE
        ? await this.budgetEvents.snapshot(current.householdId, current.categoryId, current.date)
        : null;
    if (current.postingStatus !== PostingStatus.SCHEDULED) {
      await applyBalance(tx, current, -1);
    }
    const linked = await tx.bill.findFirst({ where: { transactionId: current.id }, select: { id: true } });
    if (linked) {
      await tx.bill.update({
        where: { id: linked.id },
        data: { status: 'PENDING', transactionId: null, settlement: null },
      });
    }
    await tx.transaction.delete({ where: { id: current.id } });
    const events: PendingDomainEvent[] = [];
    if (current.type === TransactionType.EXPENSE && current.categoryId) {
      events.push({
        name: 'budget.threshold_crossed',
        householdId: current.householdId,
        categoryId: current.categoryId,
        date: current.date.toISOString(),
        previous,
      });
    }
    return { events };
  }

  private async snapshotExpenseKeys(
    householdId: string,
    candidates: ({ categoryId: string; date: Date } | null)[],
  ) {
    const previousByKey = new Map<string, { categoryId: string; date: Date; snapshot: BudgetSnapshot | null }>();
    for (const candidate of candidates) {
      if (!candidate) continue;
      const key = `${candidate.categoryId}:${monthFromDate(candidate.date)}`;
      if (previousByKey.has(key)) continue;
      const snapshot = await this.budgetEvents.snapshot(householdId, candidate.categoryId, candidate.date);
      previousByKey.set(key, {
        categoryId: candidate.categoryId,
        date: candidate.date,
        snapshot,
      });
    }
    return previousByKey;
  }

  private async emitExpenseKeys(
    householdId: string,
    previousByKey: Map<string, { categoryId: string; date: Date; snapshot: BudgetSnapshot | null }>,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const item of previousByKey.values()) {
      await this.budgetEvents.emitIfCrossed(
        householdId,
        item.categoryId,
        item.date,
        item.snapshot,
        seen,
      );
    }
  }

  private async assertReferences(
    householdId: string,
    householdMemberId: string,
    dto: CreateTransactionDto,
  ): Promise<void> {
    if (dto.type === 'TRANSFER') {
      await this.assertAccounts(householdId, householdMemberId, [dto.fromAccountId, dto.toAccountId]);
      return;
    }
    await this.assertAccounts(householdId, householdMemberId, [dto.accountId]);
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

  private async assertAccounts(
    householdId: string,
    householdMemberId: string,
    ids: (string | undefined)[],
  ): Promise<void> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    for (const id of unique) {
      await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, id);
    }
  }

  private async accessibleIds(householdId: string, householdMemberId: string) {
    return getAccessibleAccountIds(this.prisma.client, householdId, householdMemberId);
  }

  private pendingEvents(
    householdId: string,
    dto: CreateTransactionDto,
    date: Date,
    previous: BudgetSnapshot | null,
  ): PendingDomainEvent[] {
    if (dto.type === TransactionType.EXPENSE && dto.categoryId) {
      return [
        {
          name: 'budget.threshold_crossed',
          householdId,
          categoryId: dto.categoryId,
          date: date.toISOString(),
          previous,
        },
      ];
    }
    if (dto.type === TransactionType.TRANSFER && dto.toAccountId) {
      return [{ name: 'savings-goal.check', householdId, accountId: dto.toAccountId }];
    }
    return [];
  }

  private toData(
    householdId: string,
    userId: string,
    dto: CreateTransactionDto,
    extras: TransactionWriteExtras = {},
  ) {
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
      source: extras.source === 'IMPORTED' ? TransactionSource.IMPORTED : TransactionSource.MANUAL,
      externalId: extras.externalId ?? null,
      externalProvider: extras.externalProvider ?? null,
      importBatchId: extras.importBatchId ?? null,
      recurringTransactionId: extras.recurringTransactionId ?? null,
      postingStatus:
        extras.postingStatus === 'SCHEDULED' ? PostingStatus.SCHEDULED : PostingStatus.POSTED,
    };
  }

  private async findOwned(householdId: string, householdMemberId: string, id: string) {
    const accessibleIds = await this.accessibleIds(householdId, householdMemberId);
    const transaction = await this.prisma.client.transaction.findFirst({
      where: { id, householdId, ...transactionTouchesAccessibleAccounts(accessibleIds) },
    });
    if (!transaction) {
      throw new NotFoundException('Lançamento não encontrado.');
    }
    return transaction;
  }

  private toResponse(
    transaction: {
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
      bill?: { id: string; settlement: string | null } | null;
    },
    accessibleIds: ReadonlySet<string>,
  ) {
    return {
      id: transaction.id,
      description: transaction.description,
      amount: moneyString(transaction.amount),
      type: transaction.type,
      date: transaction.date.toISOString(),
      accountId: redactInaccessibleAccountId(transaction.accountId, accessibleIds),
      categoryId: transaction.categoryId,
      fromAccountId: redactInaccessibleAccountId(transaction.fromAccountId, accessibleIds),
      toAccountId: redactInaccessibleAccountId(transaction.toAccountId, accessibleIds),
      source: transaction.source ?? 'MANUAL',
      externalId: transaction.externalId ?? null,
      postingStatus: transaction.postingStatus ?? 'POSTED',
      installmentPlanId: transaction.installmentPlanId ?? null,
      installmentNumber: transaction.installmentNumber ?? null,
      recurringTransactionId: transaction.recurringTransactionId ?? null,
      billId: transaction.bill?.id ?? null,
      billSettlement: transaction.bill?.settlement ?? null,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }
}
