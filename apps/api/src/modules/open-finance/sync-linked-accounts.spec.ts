import {
  FAKE_BILL_CENTS,
  FAKE_CARD_ID,
  FAKE_CHECKING_ID,
  FAKE_CONNECTION_ID,
  FakeOpenFinanceProvider,
} from '@orcadom/open-finance-testing';
import type { ProviderTransaction } from '@orcadom/open-finance-core';
import { describe, expect, it } from 'vitest';
import {
  importProviderTransactions,
  selectForMatch,
  type LedgerMatchQuery,
  type LedgerTransaction,
  type MovementInput,
  type OpenFinanceLedger,
  type TransferConversion,
} from './import-provider-transactions.js';
import { createOpenFinanceProvider, resolveOpenFinanceProviderName } from './provider-factory.js';
import { syncLinkedAccounts, syncRange } from './sync-linked-accounts.js';

class MemoryLedger implements OpenFinanceLedger {
  readonly transactions: LedgerTransaction[] = [];
  readonly matchQueries: LedgerMatchQuery[] = [];
  private readonly keys = new Map<string, string>();

  hasExternal(providerId: string, externalId: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(`${providerId}:${externalId}`));
  }

  listForMatch(query: LedgerMatchQuery): Promise<LedgerTransaction[]> {
    this.matchQueries.push(query);
    return Promise.resolve(
      selectForMatch(this.transactions, query, (transactionId) => this.hasProviderKey(query.providerId, transactionId)),
    );
  }

  keyFor(providerId: string, externalId: string): string | undefined {
    return this.keys.get(`${providerId}:${externalId}`);
  }

  private hasProviderKey(providerId: string, transactionId: string): boolean {
    const prefix = `${providerId}:`;
    for (const [key, id] of this.keys) {
      if (id === transactionId && key.startsWith(prefix)) return true;
    }
    return false;
  }

  addMovement(input: MovementInput): Promise<void> {
    const id = `tx-${String(this.transactions.length + 1)}`;
    this.transactions.push({
      id,
      date: input.date,
      amount: input.amount,
      type: input.direction === 'out' ? 'EXPENSE' : 'INCOME',
      description: input.description,
      accountId: input.accountId,
      fromAccountId: null,
      toAccountId: null,
      externalProvider: input.providerId,
      boundToProvider: true,
    });
    this.keys.set(`${input.providerId}:${input.externalId}`, id);
    return Promise.resolve();
  }

  convertToTransfer(input: TransferConversion): Promise<void> {
    const current = this.transactions.find((transaction) => transaction.id === input.transactionId);
    if (!current) return Promise.reject(new Error('missing transaction'));
    current.type = 'TRANSFER';
    current.accountId = null;
    current.fromAccountId = input.fromAccountId;
    current.toAccountId = input.toAccountId;
    current.amount = input.amount;
    current.date = input.date;
    current.description = input.description;
    this.keys.set(`${input.providerId}:${input.externalId}`, current.id);
    return Promise.resolve();
  }

  rememberExternal(providerId: string, externalId: string, transactionId: string): Promise<void> {
    this.keys.set(`${providerId}:${externalId}`, transactionId);
    return Promise.resolve();
  }
}

describe('open finance sync', () => {
  it('imports the fake provider once and keeps the same transactions on the second sync', async () => {
    const provider = new FakeOpenFinanceProvider();
    const ledger = new MemoryLedger();
    const links = [
      { externalId: FAKE_CHECKING_ID, localAccountId: 'local-checking', kind: 'CHECKING' as const },
      { externalId: FAKE_CARD_ID, localAccountId: 'local-card', kind: 'CREDIT_CARD' as const },
    ];
    const input = {
      householdId: 'household',
      userId: 'user',
      range: syncRange(null),
      links,
    };
    await syncLinkedAccounts(provider, ledger, input);
    const firstCount = ledger.transactions.length;
    const transfer = ledger.transactions.find((transaction) => transaction.type === 'TRANSFER');
    expect(transfer?.fromAccountId).toBe('local-checking');
    expect(transfer?.toAccountId).toBe('local-card');
    expect(transfer?.amount).toBe(FAKE_BILL_CENTS / 100);
    expect(ledger.transactions.some((transaction) => transaction.description.includes('2/3'))).toBe(true);
    expect(
      ledger.transactions.some(
        (transaction) => transaction.type === 'INCOME' && transaction.description === 'Pix recebido',
      ),
    ).toBe(true);

    await syncLinkedAccounts(provider, ledger, input);
    expect(ledger.transactions).toHaveLength(firstCount);
    expect(ledger.transactions.filter((transaction) => transaction.type === 'TRANSFER')).toHaveLength(1);
    expect(await provider.getConnection(FAKE_CONNECTION_ID)).toMatchObject({ id: FAKE_CONNECTION_ID });
  });
});

function posted(partial: Pick<LedgerTransaction, 'id' | 'date' | 'amount' | 'description'>): LedgerTransaction {
  return {
    type: 'EXPENSE',
    accountId: 'local-checking',
    fromAccountId: null,
    toAccountId: null,
    externalProvider: null,
    boundToProvider: false,
    ...partial,
  };
}

function providerRow(
  partial: Pick<ProviderTransaction, 'externalId' | 'description' | 'amountCents'> & { date: string },
): ProviderTransaction {
  return {
    accountExternalId: 'checking-ext',
    date: new Date(`${partial.date}T12:00:00.000Z`),
    externalId: partial.externalId,
    description: partial.description,
    amountCents: partial.amountCents,
  };
}

describe('open finance reconciliation with file imports', () => {
  it('links an imported statement and creates only the provider row that has no counterpart', async () => {
    const ledger = new MemoryLedger();
    ledger.transactions.push(
      posted({ id: 'ofx-market', date: '2026-10-10', amount: 10, description: 'Supermercado' }),
      posted({ id: 'ofx-old', date: '2026-08-01', amount: 42, description: 'Antigo' }),
    );
    const input = {
      providerId: 'meupluggy',
      householdId: 'household',
      userId: 'user',
      localAccountId: 'local-checking',
      transactions: [
        providerRow({ externalId: 'bank-market', date: '2026-10-10', description: 'Supermercado', amountCents: -1000 }),
        providerRow({ externalId: 'bank-new', date: '2026-10-11', description: 'Livraria', amountCents: -4200 }),
      ],
    };
    await importProviderTransactions(ledger, input);
    expect(ledger.transactions).toHaveLength(3);
    expect(ledger.keyFor('meupluggy', 'bank-market')).toBe('ofx-market');
    const createdId = ledger.keyFor('meupluggy', 'bank-new');
    expect(createdId).toBeTruthy();
    expect(createdId).not.toBe('ofx-old');
    expect(ledger.transactions.find((transaction) => transaction.id === createdId)?.description).toBe('Livraria');
    expect(ledger.matchQueries).toHaveLength(1);
    expect(ledger.matchQueries[0]).toMatchObject({ accountId: 'local-checking', from: '2026-10-07', to: '2026-10-14' });

    await importProviderTransactions(ledger, input);
    expect(ledger.transactions).toHaveLength(3);
    expect(ledger.matchQueries).toHaveLength(1);
  });

  it('links two identical amounts to two different imported postings', async () => {
    const ledger = new MemoryLedger();
    ledger.transactions.push(
      posted({ id: 'ofx-a', date: '2026-10-12', amount: 5, description: 'Padaria' }),
      posted({ id: 'ofx-b', date: '2026-10-12', amount: 5, description: 'Padaria' }),
      posted({ id: 'already', date: '2026-10-12', amount: 5, description: 'Padaria' }),
    );
    await ledger.rememberExternal('meupluggy', 'bank-old', 'already');
    await importProviderTransactions(ledger, {
      providerId: 'meupluggy',
      householdId: 'household',
      userId: 'user',
      localAccountId: 'local-checking',
      transactions: [
        providerRow({ externalId: 'bank-1', date: '2026-10-12', description: 'Padaria', amountCents: -500 }),
        providerRow({ externalId: 'bank-2', date: '2026-10-12', description: 'Padaria', amountCents: -500 }),
      ],
    });
    expect(ledger.transactions).toHaveLength(3);
    const linked = [ledger.keyFor('meupluggy', 'bank-1'), ledger.keyFor('meupluggy', 'bank-2')].sort();
    expect(linked).toEqual(['ofx-a', 'ofx-b']);
    expect(linked).not.toContain('already');
  });

  it('turns repeated amounts between two controlled accounts into transfers', async () => {
    const ledger = new MemoryLedger();
    const base = {
      providerId: 'meupluggy',
      householdId: 'household',
      userId: 'user',
    };
    await importProviderTransactions(ledger, {
      ...base,
      localAccountId: 'checking',
      transactions: [
        providerRow({ externalId: 'out-1', date: '2026-10-01', description: 'PIX', amountCents: -10_000 }),
        providerRow({ externalId: 'out-2', date: '2026-10-03', description: 'PIX', amountCents: -10_000 }),
      ],
    });
    await importProviderTransactions(ledger, {
      ...base,
      localAccountId: 'sicredi',
      transactions: [
        providerRow({ externalId: 'in-1', date: '2026-10-01', description: 'PIX', amountCents: 10_000 }),
        providerRow({ externalId: 'in-2', date: '2026-10-04', description: 'PIX', amountCents: 10_000 }),
      ],
    });
    const transfers = ledger.transactions.filter((transaction) => transaction.type === 'TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(transfers.every((transaction) => transaction.fromAccountId === 'checking' && transaction.toAccountId === 'sicredi')).toBe(true);
    expect(ledger.transactions.some((transaction) => transaction.type !== 'TRANSFER')).toBe(false);
  });
});

describe('open finance provider selection', () => {
  it('uses fake outside production and refuses it in production', () => {
    expect(resolveOpenFinanceProviderName({ NODE_ENV: 'test' })).toBe('fake');
    expect(resolveOpenFinanceProviderName({ NODE_ENV: 'production' })).toBeNull();
    expect(() =>
      resolveOpenFinanceProviderName({ NODE_ENV: 'production', OPEN_FINANCE_PROVIDER: 'fake' }),
    ).toThrow(/refused/);
    expect(createOpenFinanceProvider({ NODE_ENV: 'test' })?.id).toBe('fake');
  });
});
