import { Module } from '@nestjs/common';
import { BudgetEventsService } from './budget-events.service.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetEventsService],
  exports: [BudgetsService, BudgetEventsService],
})
export class BudgetsModule {}
