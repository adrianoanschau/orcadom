import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostingStatus, runWithActor } from '@orcadom/database';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { startOfNextUtcDay } from './generate-installments.js';
import { postIfScheduled } from './posting.js';

@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetEvents: BudgetEventsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'America/Sao_Paulo' })
  async postDueScheduledTransactions(): Promise<number> {
    return runWithActor({ userId: null, householdId: null, source: 'CRON_INSTALLMENT' }, async () => {
      const due = await this.prisma.client.transaction.findMany({
        where: { postingStatus: PostingStatus.SCHEDULED, date: { lt: startOfNextUtcDay(new Date()) } },
      });

      let posted = 0;
      for (const row of due) {
        const previous = await this.budgetEvents.snapshot(row.householdId, row.categoryId, row.date);
        const result = await this.prisma.client.$transaction((tx) => postIfScheduled(tx, row.id));
        if (result !== 'posted') continue;
        posted += 1;
        await this.budgetEvents.emitIfCrossed(row.householdId, row.categoryId, row.date, previous?.status);
      }
      if (posted > 0) {
        this.logger.log(`Postou ${String(posted)} lançamento(s) agendado(s).`);
      }
      return posted;
    });
  }
}
