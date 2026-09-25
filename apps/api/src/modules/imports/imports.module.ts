import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { ImportPreviewStore } from './import-preview.store.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [BudgetsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportPreviewStore],
  exports: [ImportsService],
})
export class ImportsModule {}
