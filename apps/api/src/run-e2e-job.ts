/**
 * Invoca jobs de postagem/recorrência fora do cron — usado pelos testes E2E.
 *
 * Uso (após build): node dist/run-e2e-job.js posting|recurring
 */
import './load-env.js';
import 'reflect-metadata';

process.env.CRON_DISABLED ??= 'true';

const job = process.argv[2];

async function main(): Promise<void> {
  if (job !== 'posting' && job !== 'recurring') {
    console.error('Uso: run-e2e-job.js <posting|recurring>');
    process.exit(1);
  }

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module.js');
  const { PostingService } = await import('./modules/installment-plans/posting.service.js');
  const { RecurringTransactionsService } = await import(
    './modules/recurring-transactions/recurring-transactions.service.js'
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const count =
      job === 'posting'
        ? await app.get(PostingService).postDueScheduledTransactions()
        : await app.get(RecurringTransactionsService).generateDueRecurringOccurrences();
    console.log(JSON.stringify({ job, count }));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
