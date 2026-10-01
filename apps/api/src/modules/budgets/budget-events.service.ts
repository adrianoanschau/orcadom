import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getCategoryAncestorIds } from '../../common/category-tree.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetsService } from './budgets.service.js';
import { crossingBudgetIds, monthFromDate, type BudgetStatus } from './budget-progress.js';

export const BUDGET_THRESHOLD_CROSSED = 'budget.threshold_crossed';

export interface BudgetThresholdPayload {
  householdId: string;
  categoryId: string;
  month: string;
  status: Exclude<BudgetStatus, 'on_track'>;
}

export interface BudgetLevelSnapshot {
  categoryId: string;
  status: BudgetStatus | null;
}

export type BudgetSnapshot = BudgetLevelSnapshot[];

@Injectable()
export class BudgetEventsService {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async snapshot(
    householdId: string,
    categoryId: string | null | undefined,
    date: Date,
  ): Promise<BudgetSnapshot | null> {
    if (!categoryId) return null;
    const ids = await getCategoryAncestorIds(this.prisma.client, householdId, categoryId);
    const month = monthFromDate(date);
    return Promise.all(
      ids.map(async (id) => {
        const progress = await this.budgets.progressFor(householdId, id, month);
        return { categoryId: id, status: progress?.status ?? null };
      }),
    );
  }

  async emitIfCrossed(
    householdId: string,
    categoryId: string | null | undefined,
    date: Date,
    previous: BudgetSnapshot | null | undefined,
    seen: Set<string> = new Set<string>(),
  ): Promise<void> {
    if (!categoryId) return;
    const ids = await getCategoryAncestorIds(this.prisma.client, householdId, categoryId);
    const month = monthFromDate(date);
    const current = new Map<string, BudgetStatus | null>();
    for (const id of ids) {
      const progress = await this.budgets.progressFor(householdId, id, month);
      current.set(id, progress?.status ?? null);
    }
    for (const id of crossingBudgetIds(ids, previous, current)) {
      const key = `${id}:${month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const status = current.get(id);
      if (!status || status === 'on_track') continue;
      const payload: BudgetThresholdPayload = {
        householdId,
        categoryId: id,
        month,
        status,
      };
      this.events.emit(BUDGET_THRESHOLD_CROSSED, payload);
    }
  }
}
