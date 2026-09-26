import { Module } from '@nestjs/common';
import { SavingsGoalEventsService } from './savings-goal-events.service.js';
import { SavingsGoalsController } from './savings-goals.controller.js';
import { SavingsGoalsService } from './savings-goals.service.js';

@Module({
  controllers: [SavingsGoalsController],
  providers: [SavingsGoalsService, SavingsGoalEventsService],
  exports: [SavingsGoalsService],
})
export class SavingsGoalsModule {}
