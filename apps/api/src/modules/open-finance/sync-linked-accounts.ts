import type { OpenFinanceProvider, ProviderAccount } from '@orcadom/open-finance-core';
import { importProviderTransactions, type OpenFinanceLedger } from './import-provider-transactions.js';

const KIND_ORDER: Record<ProviderAccount['kind'], number> = {
  CHECKING: 0,
  SAVINGS: 1,
  CREDIT_CARD: 2,
};

export interface LinkedProviderAccount {
  externalId: string;
  localAccountId: string;
  kind: ProviderAccount['kind'];
}

export async function collectAccountTransactions(
  provider: OpenFinanceProvider,
  accountExternalId: string,
  range: { from: Date; to: Date },
) {
  const items = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const result = await provider.listTransactions(accountExternalId, range, cursor);
    items.push(...result.items);
    if (!result.nextCursor) return items;
    if (seen.has(result.nextCursor)) throw new Error('Open finance pagination cursor repeated');
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error('Open finance pagination did not end');
}

export async function syncLinkedAccounts(
  provider: OpenFinanceProvider,
  ledger: OpenFinanceLedger,
  input: {
    householdId: string;
    userId: string;
    range: { from: Date; to: Date };
    links: readonly LinkedProviderAccount[];
  },
): Promise<void> {
  const links = [...input.links].sort(
    (left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.externalId.localeCompare(right.externalId),
  );
  for (const link of links) {
    const transactions = await collectAccountTransactions(provider, link.externalId, input.range);
    await importProviderTransactions(ledger, {
      providerId: provider.id,
      householdId: input.householdId,
      userId: input.userId,
      localAccountId: link.localAccountId,
      transactions,
    });
  }
}

export function syncRange(lastSyncAt: Date | null, now = new Date()): { from: Date; to: Date } {
  if (lastSyncAt) return { from: lastSyncAt, to: now };
  return { from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), to: now };
}
