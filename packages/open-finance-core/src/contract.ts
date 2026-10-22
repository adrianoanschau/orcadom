import { describe, expect, it } from 'vitest';
import { ProviderAuthError, ProviderRateLimitError, ProviderUnavailableError } from './errors.js';
import type { OpenFinanceProvider } from './provider.js';
import {
  CONTRACT_ERROR_IDS,
  providerAccountSchema,
  providerConnectionSchema,
  providerTransactionSchema,
} from './schemas.js';

export interface ProviderContractSubject {
  provider: OpenFinanceProvider;
  connectionId: string;
}

async function collect(
  provider: OpenFinanceProvider,
  accountExternalId: string,
  range: { from: Date; to: Date },
) {
  const items = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const result = await provider.listTransactions(accountExternalId, range, cursor);
    items.push(...result.items);
    if (!result.nextCursor) return { items, pages: page + 1 };
    expect(seen.has(result.nextCursor)).toBe(false);
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error('pagination did not finish');
}

export function runProviderContractTests(factory: () => ProviderContractSubject): void {
  describe('open finance provider contract', () => {
    it('pages every transaction and keeps external ids stable', async () => {
      const { provider, connectionId } = factory();
      const accounts = providerAccountSchema.array().parse(await provider.listAccounts(connectionId));
      const account = accounts[0];
      expect(account).toBeDefined();
      if (!account) return;
      const range = { from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), to: new Date() };
      const first = await collect(provider, account.externalId, range);
      const second = await collect(provider, account.externalId, range);
      expect(first.pages).toBeGreaterThan(1);
      expect(first.items.map((item) => item.externalId)).toEqual(second.items.map((item) => item.externalId));
      for (const item of first.items) {
        const parsed = providerTransactionSchema.parse(item);
        expect(Number.isInteger(parsed.amountCents)).toBe(true);
      }
    });

    it('returns null when the webhook signature is invalid', () => {
      const { provider } = factory();
      expect(provider.parseWebhook({}, '{"type":"CONNECTION_UPDATED"}')).toBeNull();
      expect(
        provider.parseWebhook(
          { 'x-open-finance-signature': 'deadbeef' },
          '{"type":"CONNECTION_UPDATED","connectionId":"x","payload":{}}',
        ),
      ).toBeNull();
    });

    it('maps provider failures to typed errors', async () => {
      const { provider, connectionId } = factory();
      providerConnectionSchema.parse(await provider.getConnection(connectionId));
      await expect(provider.getConnection(CONTRACT_ERROR_IDS.auth)).rejects.toBeInstanceOf(ProviderAuthError);
      await expect(provider.getConnection(CONTRACT_ERROR_IDS.unavailable)).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
      try {
        await provider.getConnection(CONTRACT_ERROR_IDS.rateLimit);
        throw new Error('rate limit was not raised');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderRateLimitError);
        if (error instanceof ProviderRateLimitError) {
          expect(error.retryAfter).toBeInstanceOf(Date);
          expect(error.retryAfter.getTime()).toBeGreaterThan(Date.now() - 1000);
        }
      }
    });
  });
}
