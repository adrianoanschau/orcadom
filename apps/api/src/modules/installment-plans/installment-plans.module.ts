import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { InstallmentPlansController } from './installment-plans.controller.js';
import { InstallmentPlansService } from './installment-plans.service.js';
import { PostingService } from './posting.service.js';

@Module({
  imports: [BudgetsModule],
  controllers: [InstallmentPlansController],
  providers: [InstallmentPlansService, PostingService],
  exports: [PostingService],
})
export class InstallmentPlansModule {}
