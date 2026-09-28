import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SavingsGoalStatus, TransactionType } from '@orcadom/database';
import type { CreateSavingsGoalDto, UpdateSavingsGoalDto } from '@orcadom/types';
import {
  accessibleAccountWhere,
  assertAccountAccessible,
  getAccessibleAccountIds,
  redactInaccessibleAccountId,
} from '../../common/account-access.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { computeGoalProgress, isGoalReached } from './goal-progress.js';
import { SavingsGoalEventsService } from './savings-goal-events.service.js';

@Injectable()
export class SavingsGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SavingsGoalEventsService,
  ) {}

  async create(householdId: string, householdMemberId: string, dto: CreateSavingsGoalDto) {
    await this.assertAccount(householdId, householdMemberId, dto.accountId);
    const created = await this.prisma.client.savingsGoal.create({
      data: {
        householdId,
        name: dto.name,
        targetAmount: toDecimal(dto.targetAmount),
        accountId: dto.accountId,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      },
      include: { account: { select: { name: true } } },
    });
    await this.completeIfReached(householdId, created.accountId);
    return this.toListItem(await this.findOwned(householdId, householdMemberId, created.id));
  }

  async list(householdId: string, householdMemberId: string) {
    const goals = await this.prisma.client.savingsGoal.findMany({
      where: { householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
      include: { account: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const items = await Promise.all(goals.map((goal) => this.toListItem(goal)));
    return items.sort((left, right) => compareGoals(left, right));
  }

  async get(householdId: string, householdMemberId: string, id: string) {
    const goal = await this.findOwned(householdId, householdMemberId, id);
    const [item, transfers] = await Promise.all([
      this.toListItem(goal),
      this.listProgressTransfers(householdId, householdMemberId, goal),
    ]);
    return { ...item, transfers };
  }

  async update(householdId: string, householdMemberId: string, id: string, dto: UpdateSavingsGoalDto) {
    const current = await this.findOwned(householdId, householdMemberId, id);
    if (current.status === SavingsGoalStatus.ABANDONED) {
      throw new BadRequestException('Uma meta abandonada não pode ser editada.');
    }
    await this.prisma.client.savingsGoal.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: toDecimal(dto.targetAmount) } : {}),
        ...(dto.targetDate !== undefined
          ? { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }
          : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
      },
    });
    if (current.status === SavingsGoalStatus.ACTIVE) {
      await this.completeIfReached(householdId, current.accountId);
    }
    return this.toListItem(await this.findOwned(householdId, householdMemberId, current.id));
  }

  async abandon(householdId: string, householdMemberId: string, id: string) {
    const current = await this.findOwned(householdId, householdMemberId, id);
    if (current.status !== SavingsGoalStatus.ACTIVE) {
      throw new BadRequestException('Só é possível abandonar uma meta ativa.');
    }
    await this.prisma.client.savingsGoal.update({
      where: { id: current.id },
      data: { status: SavingsGoalStatus.ABANDONED },
    });
    return this.toListItem(await this.findOwned(householdId, householdMemberId, current.id));
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    await this.findOwned(householdId, householdMemberId, id);
    await this.prisma.client.savingsGoal.delete({ where: { id } });
  }

  async completeIfReached(householdId: string, accountId: string | null | undefined): Promise<void> {
    if (!accountId) return;
    const goals = await this.prisma.client.savingsGoal.findMany({
      where: { householdId, accountId, status: SavingsGoalStatus.ACTIVE },
    });
    for (const goal of goals) {
      const progress = await this.getGoalProgress(goal);
      if (!isGoalReached(progress.saved, Number(goal.targetAmount))) continue;
      await this.prisma.client.savingsGoal.update({
        where: { id: goal.id },
        data: { status: SavingsGoalStatus.COMPLETED, completedAt: new Date() },
      });
      this.events.emitCompleted({
        householdId,
        goalId: goal.id,
        accountId: goal.accountId,
        name: goal.name,
        targetAmount: moneyString(goal.targetAmount),
      });
    }
  }

  async getGoalProgress(goal: { accountId: string; startDate: Date; targetAmount: { toFixed(digits: number): string } }) {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.client.transaction.aggregate({
        where: {
          toAccountId: goal.accountId,
          type: TransactionType.TRANSFER,
          date: { gte: goal.startDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: {
          fromAccountId: goal.accountId,
          type: TransactionType.TRANSFER,
          date: { gte: goal.startDate },
        },
        _sum: { amount: true },
      }),
    ]);
    const saved = Number(moneyString(incoming._sum.amount)) - Number(moneyString(outgoing._sum.amount));
    return computeGoalProgress(Number(saved.toFixed(2)), Number(moneyString(goal.targetAmount)));
  }

  private async listProgressTransfers(
    householdId: string,
    householdMemberId: string,
    goal: { accountId: string; startDate: Date },
  ) {
    const accessible = new Set(
      await getAccessibleAccountIds(this.prisma.client, householdId, householdMemberId),
    );
    const rows = await this.prisma.client.transaction.findMany({
      where: {
        type: TransactionType.TRANSFER,
        date: { gte: goal.startDate },
        OR: [{ toAccountId: goal.accountId }, { fromAccountId: goal.accountId }],
      },
      include: {
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => {
      const incoming = row.toAccountId === goal.accountId;
      return {
        id: row.id,
        description: row.description,
        amount: moneyString(row.amount),
        date: row.date.toISOString(),
        direction: incoming ? ('in' as const) : ('out' as const),
        fromAccountId: redactInaccessibleAccountId(row.fromAccountId, accessible),
        toAccountId: redactInaccessibleAccountId(row.toAccountId, accessible),
        fromAccountName: accessible.has(row.fromAccountId ?? '') ? (row.fromAccount?.name ?? null) : null,
        toAccountName: accessible.has(row.toAccountId ?? '') ? (row.toAccount?.name ?? null) : null,
      };
    });
  }

  private async assertAccount(
    householdId: string,
    householdMemberId: string,
    accountId: string,
  ): Promise<void> {
    await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, accountId);
  }

  private async findOwned(householdId: string, householdMemberId: string, id: string) {
    const goal = await this.prisma.client.savingsGoal.findFirst({
      where: { id, householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
      include: { account: { select: { name: true } } },
    });
    if (!goal) {
      throw new NotFoundException('Meta não encontrada.');
    }
    return goal;
  }

  private async toListItem(goal: {
    id: string;
    name: string;
    targetAmount: { toFixed(digits: number): string };
    targetDate: Date | null;
    startDate: Date;
    status: SavingsGoalStatus;
    completedAt: Date | null;
    createdAt: Date;
    accountId: string;
    account: { name: string };
  }) {
    const progress = await this.getGoalProgress(goal);
    return {
      id: goal.id,
      name: goal.name,
      targetAmount: moneyString(goal.targetAmount),
      targetDate: goal.targetDate?.toISOString() ?? null,
      startDate: goal.startDate.toISOString(),
      status: goal.status,
      accountId: goal.accountId,
      accountName: goal.account.name,
      saved: moneyString(toDecimal(progress.saved)),
      ratio: progress.ratio,
      remaining: moneyString(toDecimal(progress.remaining)),
      completedAt: goal.completedAt?.toISOString() ?? null,
      createdAt: goal.createdAt.toISOString(),
    };
  }
}

function compareGoals(
  left: { status: string; ratio: number; targetDate: string | null },
  right: { status: string; ratio: number; targetDate: string | null },
) {
  const rank = (status: string) => (status === 'ACTIVE' ? 0 : status === 'COMPLETED' ? 1 : 2);
  const byStatus = rank(left.status) - rank(right.status);
  if (byStatus !== 0) return byStatus;
  if (left.status === 'ACTIVE') {
    const byRatio = right.ratio - left.ratio;
    if (byRatio !== 0) return byRatio;
    if (left.targetDate && right.targetDate) return left.targetDate.localeCompare(right.targetDate);
    if (left.targetDate) return -1;
    if (right.targetDate) return 1;
  }
  return 0;
}
