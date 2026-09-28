import * as Sentry from '@sentry/nestjs';
import { getActor } from '@orcadom/database';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  const enabled = Boolean(dsn);
  Sentry.init({
    dsn: enabled ? dsn : undefined,
    enabled,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  });
}

export function captureJobException(job: string, error: unknown): void {
  if (!process.env.SENTRY_DSN) return;
  const actor = getActor();
  Sentry.withScope((scope) => {
    scope.setTag('job', job);
    if (actor.requestId) scope.setTag('requestId', actor.requestId);
    if (actor.householdId) scope.setTag('householdId', actor.householdId);
    scope.setTag('source', actor.source);
    Sentry.captureException(error);
  });
}
