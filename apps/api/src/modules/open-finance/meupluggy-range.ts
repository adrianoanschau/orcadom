import { ProviderRateLimitError, ProviderUnavailableError } from '@orcadom/open-finance-core';

const DAY_MS = 24 * 60 * 60 * 1000;

export function meupluggySyncRange(lastSyncAt: Date | null, now = new Date()): { from: Date; to: Date } {
  if (!lastSyncAt) return { from: new Date(now.getTime() - 365 * DAY_MS), to: now };
  return { from: new Date(lastSyncAt.getTime() - 7 * DAY_MS), to: now };
}

export type ConsentWarning = 'ok' | 'expiring' | 'expired';

export function consentWarning(
  expiresAt: Date | null,
  authReason: string | null,
  now = new Date(),
): ConsentWarning | null {
  if (authReason === 'consent_expired') return 'expired';
  if (!expiresAt) return null;
  if (expiresAt.getTime() <= now.getTime()) return 'expired';
  const days = (expiresAt.getTime() - now.getTime()) / DAY_MS;
  if (days <= 30) return 'expiring';
  return 'ok';
}

export async function withProviderBackoff<T>(
  work: () => Promise<T>,
  options: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      last = error;
      const retryable = error instanceof ProviderRateLimitError || error instanceof ProviderUnavailableError;
      if (!retryable || attempt === attempts - 1) throw error;
      const wait =
        error instanceof ProviderRateLimitError
          ? Math.max(0, error.retryAfter.getTime() - Date.now())
          : 250 * 2 ** attempt;
      await sleep(Math.min(wait, 30_000));
    }
  }
  throw last;
}
