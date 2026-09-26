import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BUDGET_THRESHOLD_CROSSED,
  type BudgetThresholdPayload,
} from '../budgets/budget-events.service.js';
import {
  SAVINGS_GOAL_COMPLETED,
  type SavingsGoalCompletedPayload,
} from '../savings-goals/savings-goal-events.service.js';
import {
  EMAIL_IMPORT_READY,
  EMAIL_IMPORT_UNMAPPED_ACCOUNT,
  type EmailImportEventPayload,
} from './notification-policy.js';
import { NotificationsService } from './notifications.service.js';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(BUDGET_THRESHOLD_CROSSED)
  async onBudgetThreshold(payload: BudgetThresholdPayload): Promise<void> {
    await this.safe('budget.threshold_crossed', () => this.notifications.notifyBudget(payload));
  }

  @OnEvent(SAVINGS_GOAL_COMPLETED)
  async onSavingsGoalCompleted(payload: SavingsGoalCompletedPayload): Promise<void> {
    await this.safe('savings-goal.completed', () => this.notifications.notifySavingsGoal(payload));
  }

  @OnEvent(EMAIL_IMPORT_READY)
  async onEmailImportReady(payload: EmailImportEventPayload): Promise<void> {
    await this.safe('email-import.ready', () => this.notifications.notifyEmailImport(payload, false));
  }

  @OnEvent(EMAIL_IMPORT_UNMAPPED_ACCOUNT)
  async onEmailImportUnmapped(payload: EmailImportEventPayload): Promise<void> {
    await this.safe('email-import.unmapped-account', () =>
      this.notifications.notifyEmailImport(payload, true),
    );
  }

  private async safe(event: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'falha desconhecida';
      this.logger.error(`Listener de ${event} falhou: ${detail}`);
    }
  }
}
