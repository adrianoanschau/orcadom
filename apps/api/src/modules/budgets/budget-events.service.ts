import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BudgetsService } from './budgets.service.js';
import { monthFromDate, shouldEmitThreshold, type BudgetStatus } from './budget-progress.js';

export const BUDGET_THRESHOLD_CROSSED = 'budget.threshold_crossed';

export interface BudgetThresholdPayload {
  userId: string;
  categoryId: string;
  month: string;
  status: Exclude<BudgetStatus, 'on_track'>;
}

@Injectable()
export class BudgetEventsService {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly events: EventEmitter2,
  ) {}

  async snapshot(userId: string, categoryId: string | null | undefined, date: Date) {
    if (!categoryId) return null;
    return this.budgets.progressFor(userId, categoryId, monthFromDate(date));
  }

  async emitIfCrossed(
    userId: string,
    categoryId: string | null | undefined,
    date: Date,
    previous: BudgetStatus | null | undefined,
  ): Promise<void> {
    if (!categoryId) return;
    const current = await this.budgets.progressFor(userId, categoryId, monthFromDate(date));
    if (!current || !shouldEmitThreshold(previous, current.status)) return;

    const payload: BudgetThresholdPayload = {
      userId,
      categoryId,
      month: current.month,
      status: current.status,
    };
    this.events.emit(BUDGET_THRESHOLD_CROSSED, payload);
  }
}
