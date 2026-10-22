import { Test } from '@nestjs/testing';
import { ProviderRateLimitError, ProviderUnavailableError } from '@orcadom/open-finance-core';
import {
  MEUPLUGGY_BILL_AMOUNT,
  MEUPLUGGY_CARD_ID,
  MEUPLUGGY_CHECKING_ID,
  MEUPLUGGY_DEMO_ITEM_ID,
  MeuPluggyProvider,
  accountFixtures,
  cardFixtures,
  checkingFixtures,
  itemFixture,
  transactionPage,
} from '@orcadom/open-finance-meupluggy';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { utcDateKey } from '../../common/calendar.js';
import { decryptSecret, encryptSecret, readEncryptionKey } from './credentials-crypto.js';
import {
  selectForMatch,
  type LedgerMatchQuery,
  type LedgerTransaction,
  type MovementInput,
  type OpenFinanceLedger,
  type TransferConversion,
} from './import-provider-transactions.js';
import { MeuPluggyModule } from './meupluggy.module.js';
import {
  consentWarning,
  meupluggySyncRange,
  meupluggyUnavailableMessage,
  withProviderBackoff,
} from './meupluggy-range.js';
import { syncLinkedAccounts } from './sync-linked-accounts.js';

class MemoryLedger implements OpenFinanceLedger {
  readonly transactions: LedgerTransaction[] = [];
  private readonly keys = new Map<string, string>();

  hasExternal(providerId: string, externalId: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(`${providerId}:${externalId}`));
  }

  listForMatch(query: LedgerMatchQuery): Promise<LedgerTransaction[]> {
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

describe('meupluggy feature flag', () => {
  it('registers no routes when the flag is off', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MeuPluggyModule.register({ OPEN_FINANCE_MEUPLUGGY_ENABLED: 'false' })],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const httpServer = app.getHttpServer() as { address: () => AddressInfo | null };
    const address = httpServer.address();
    if (!address) throw new Error('missing test server');
    const credentials = await fetch(`http://127.0.0.1:${String(address.port)}/open-finance/meupluggy/credentials`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const webhook = await fetch(
      `http://127.0.0.1:${String(address.port)}/open-finance/webhooks/meupluggy/token`,
      { method: 'POST', body: '{}' },
    );
    expect(credentials.status).toBe(404);
    expect(webhook.status).toBe(404);
    await app.close();
  });

  it('refuses to enable the module without an encryption key', () => {
    expect(() => MeuPluggyModule.register({ OPEN_FINANCE_MEUPLUGGY_ENABLED: 'true' })).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
    expect(() =>
      MeuPluggyModule.register({ OPEN_FINANCE_MEUPLUGGY_ENABLED: 'true', CREDENTIALS_ENCRYPTION_KEY: 'curta' }),
    ).toThrow(/CREDENTIALS_ENCRYPTION_KEY is invalid/);
  });
});

describe('meupluggy credentials', () => {
  it('round-trips the secret and warns when consent is close', () => {
    const key = readEncryptionKey(Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'));
    const cipher = encryptSecret('super-secret', key);
    expect(cipher).not.toContain('super-secret');
    expect(decryptSecret(cipher, key)).toBe('super-secret');
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    expect(consentWarning(soon, null)).toBe('expiring');
    expect(consentWarning(new Date(Date.now() - 1000), null)).toBe('expired');
    expect(consentWarning(null, 'consent_expired')).toBe('expired');
    const first = meupluggySyncRange(null, new Date('2026-10-22T12:00:00.000Z'));
    expect(first.from.toISOString()).toBe('2025-10-22T12:00:00.000Z');
    const next = meupluggySyncRange(new Date('2026-10-20T12:00:00.000Z'), new Date('2026-10-22T12:00:00.000Z'));
    expect(next.from.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(meupluggyUnavailableMessage('Provider unavailable (400): INVALID_DATE: date range is too wide')).toBe(
      'O Meu Pluggy está indisponível (400): INVALID_DATE: date range is too wide',
    );
    expect(meupluggyUnavailableMessage('Provider unavailable')).toBe('O Meu Pluggy está indisponível.');
  });

  it('retries rate limits and outages with backoff', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withProviderBackoff(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new ProviderRateLimitError(new Date(Date.now() + 25)));
        if (calls === 2) return Promise.reject(new ProviderUnavailableError());
        return Promise.resolve('ok');
      },
      {
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      },
    );
    expect(result).toBe('ok');
    expect(waits.length).toBe(2);
  });
});

describe('meupluggy sync', () => {
  const fixtureNow = new Date();
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === '/auth') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ apiKey: 'fixture-api-key' }));
        return;
      }
      if (request.method === 'PATCH') {
        response.statusCode = 500;
        response.end('manual update is not used');
        return;
      }
      if (url.pathname === `/items/${MEUPLUGGY_DEMO_ITEM_ID}`) {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(itemFixture(MEUPLUGGY_DEMO_ITEM_ID)));
        return;
      }
      if (url.pathname === '/accounts') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ page: 1, totalPages: 1, results: accountFixtures() }));
        return;
      }
      if (url.pathname === '/v2/transactions') {
        const accountId = url.searchParams.get('accountId') ?? '';
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(transactionPage(accountId, url.searchParams, fixtureNow)));
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it('imports the bill payment once as a transfer to the card', async () => {
    const provider = new MeuPluggyProvider({
      clientId: 'client-fixture',
      clientSecret: 'secret-fixture',
      itemIds: [MEUPLUGGY_DEMO_ITEM_ID],
      webhookToken: 'token',
      baseUrl,
    });
    const ledger = new MemoryLedger();
    const input = {
      householdId: 'household',
      userId: 'user',
      range: meupluggySyncRange(null),
      links: [
        { externalId: MEUPLUGGY_CHECKING_ID, localAccountId: 'local-checking', kind: 'CHECKING' as const },
        { externalId: MEUPLUGGY_CARD_ID, localAccountId: 'local-card', kind: 'CREDIT_CARD' as const },
      ],
    };
    await syncLinkedAccounts(provider, ledger, input);
    const transfer = ledger.transactions.find((transaction) => transaction.type === 'TRANSFER');
    expect(transfer?.fromAccountId).toBe('local-checking');
    expect(transfer?.toAccountId).toBe('local-card');
    expect(transfer?.amount).toBe(MEUPLUGGY_BILL_AMOUNT);
    const count = ledger.transactions.length;
    await syncLinkedAccounts(provider, ledger, input);
    expect(ledger.transactions).toHaveLength(count);
    expect(ledger.transactions.filter((transaction) => transaction.type === 'TRANSFER')).toHaveLength(1);
  });

  it('links a previously imported statement instead of duplicating it', async () => {
    const provider = new MeuPluggyProvider({
      clientId: 'client-fixture',
      clientSecret: 'secret-fixture',
      itemIds: [MEUPLUGGY_DEMO_ITEM_ID],
      webhookToken: 'token',
      baseUrl,
    });
    const ledger = new MemoryLedger();
    for (const row of checkingFixtures(fixtureNow)) {
      ledger.transactions.push({
        id: `ofx-${row.id}`,
        date: utcDateKey(new Date(row.date)),
        amount: Math.abs(row.amount),
        type: row.amount < 0 ? 'EXPENSE' : 'INCOME',
        description: row.description,
        accountId: 'local-checking',
        fromAccountId: null,
        toAccountId: null,
        externalProvider: null,
        boundToProvider: false,
      });
    }
    const input = {
      householdId: 'household',
      userId: 'user',
      range: meupluggySyncRange(null, fixtureNow),
      links: [
        { externalId: MEUPLUGGY_CHECKING_ID, localAccountId: 'local-checking', kind: 'CHECKING' as const },
        { externalId: MEUPLUGGY_CARD_ID, localAccountId: 'local-card', kind: 'CREDIT_CARD' as const },
      ],
    };
    const seeded = ledger.transactions.length;
    await syncLinkedAccounts(provider, ledger, input);
    expect(ledger.transactions).toHaveLength(seeded + cardFixtures(fixtureNow).length - 1);
    for (const row of [...checkingFixtures(fixtureNow), ...cardFixtures(fixtureNow)]) {
      expect(ledger.keyFor(provider.id, row.id)).toBeTruthy();
    }
    const count = ledger.transactions.length;
    await syncLinkedAccounts(provider, ledger, input);
    expect(ledger.transactions).toHaveLength(count);
    expect(ledger.transactions.filter((transaction) => transaction.description.startsWith('Compra'))).toHaveLength(24);
  });
});
