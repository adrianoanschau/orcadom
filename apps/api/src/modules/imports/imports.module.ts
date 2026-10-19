import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ImportPreviewStore } from './import-preview.store.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [TransactionsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportPreviewStore],
  exports: [ImportsService],
})
export class ImportsModule {}
