import {
  FAKE_BILL_CENTS,
  FAKE_CARD_ID,
  FAKE_CHECKING_ID,
  FAKE_CONNECTION_ID,
  FakeOpenFinanceProvider,
} from '@orcadom/open-finance-testing';
import { describe, expect, it } from 'vitest';
import type {
  LedgerTransaction,
  MovementInput,
  OpenFinanceLedger,
  TransferConversion,
} from './import-provider-transactions.js';
import { createOpenFinanceProvider, resolveOpenFinanceProviderName } from './provider-factory.js';
import { syncLinkedAccounts, syncRange } from './sync-linked-accounts.js';

class MemoryLedger implements OpenFinanceLedger {
  readonly transactions: LedgerTransaction[] = [];
  private readonly keys = new Map<string, string>();

  hasExternal(providerId: string, externalId: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(`${providerId}:${externalId}`));
  }

  listForMatch(): Promise<LedgerTransaction[]> {
    return Promise.resolve(this.transactions.map((transaction) => ({ ...transaction })));
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
