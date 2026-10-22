import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { OpenFinanceController } from './open-finance.controller.js';
import { OpenFinanceService } from './open-finance.service.js';
import { PrismaOpenFinanceLedger } from './prisma-ledger.js';
import { createOpenFinanceProvider, OPEN_FINANCE_PROVIDER } from './provider-factory.js';

@Module({
  imports: [TransactionsModule],
  controllers: [OpenFinanceController],
  providers: [
    OpenFinanceService,
    PrismaOpenFinanceLedger,
    {
      provide: OPEN_FINANCE_PROVIDER,
      useFactory: () => createOpenFinanceProvider(process.env),
    },
  ],
})
export class OpenFinanceModule {}
