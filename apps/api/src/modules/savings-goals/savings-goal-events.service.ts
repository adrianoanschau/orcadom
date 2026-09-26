import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export const SAVINGS_GOAL_COMPLETED = 'savings-goal.completed';

export interface SavingsGoalCompletedPayload {
  householdId: string;
  goalId: string;
  name: string;
  targetAmount: string;
}

@Injectable()
export class SavingsGoalEventsService {
  constructor(private readonly events: EventEmitter2) {}

  emitCompleted(payload: SavingsGoalCompletedPayload): void {
    this.events.emit(SAVINGS_GOAL_COMPLETED, payload);
  }
}
