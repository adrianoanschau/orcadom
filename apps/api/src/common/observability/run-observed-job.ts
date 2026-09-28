import { Logger } from '@nestjs/common';
import { runWithActor, type AuditSource } from '@orcadom/database';
import { randomUUID } from 'node:crypto';
import { cronJobDuration, cronJobRunsTotal } from './metrics.js';
import { captureJobException } from './sentry.js';

export async function runObservedJob<T>(
  job: string,
  source: AuditSource,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = new Logger(`job:${job}`);
  const requestId = randomUUID();
  return runWithActor({ userId: null, householdId: null, source, requestId }, async () => {
    const stopTimer = cronJobDuration.startTimer({ job });
    logger.log('started');
    try {
      const result = await fn();
      cronJobRunsTotal.inc({ job, result: 'success' });
      logger.log('completed');
      return result;
    } catch (error) {
      cronJobRunsTotal.inc({ job, result: 'failure' });
      logger.error(error instanceof Error ? error.message : 'job failed');
      captureJobException(job, error);
      throw error;
    } finally {
      stopTimer();
    }
  });
}

export function captureJobItemError(job: string, error: unknown, itemId?: string): void {
  const logger = new Logger(`job:${job}`);
  const detail = error instanceof Error ? error.message : 'falha desconhecida';
  logger.error(itemId ? `item ${itemId} failed: ${detail}` : `item failed: ${detail}`);
  captureJobException(job, error);
}
