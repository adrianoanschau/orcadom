import { CONTRACT_ERROR_IDS } from '@orcadom/open-finance-core';
import { runProviderContractTests } from '@orcadom/open-finance-core/contract';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotSupportedError } from './errors.js';
import {
  MEUPLUGGY_CARD_ID,
  MEUPLUGGY_CHECKING_ID,
  MEUPLUGGY_DEMO_ITEM_ID,
  accountFixtures,
  itemFixture,
  transactionPage,
} from './fixtures.js';
import { MEUPLUGGY_WEBHOOK_HEADER, MeuPluggyProvider } from './provider.js';

const origin = 'https://api.pluggy.ai';
const webhookToken = 'fixture-webhook-token';
const calls: string[] = [];

const server = setupServer(
  http.post(`${origin}/auth`, () => HttpResponse.json({ apiKey: 'fixture-api-key' })),
  http.get(`${origin}/items/:id`, ({ params }) => {
    const id = String(params.id);
    calls.push(`GET /items/${id}`);
    if (id === CONTRACT_ERROR_IDS.auth) {
      return HttpResponse.json({ code: 'USER_AUTHORIZATION_EXPIRED' }, { status: 401 });
    }
    if (id === CONTRACT_ERROR_IDS.rateLimit) {
      return new HttpResponse(null, { status: 429, headers: { 'retry-after': '30' } });
    }
    if (id === CONTRACT_ERROR_IDS.unavailable) return new HttpResponse(null, { status: 503 });
    if (id === 'consent-expired') {
      return HttpResponse.json({
        ...itemFixture(id),
        status: 'LOGIN_ERROR',
        error: { code: 'USER_AUTHORIZATION_EXPIRED', message: 'authorization ended' },
      });
    }
    return HttpResponse.json(itemFixture(id));
  }),
  http.get(`${origin}/accounts/:id`, ({ params }) => {
    const account = accountFixtures().find((item) => item.id === params.id);
    if (!account) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(account);
  }),
  http.get(`${origin}/accounts`, ({ request }) => {
    const itemId = new URL(request.url).searchParams.get('itemId');
    calls.push(`GET /accounts?itemId=${itemId ?? ''}`);
    if (itemId !== MEUPLUGGY_DEMO_ITEM_ID) return HttpResponse.json({ page: 1, totalPages: 1, results: [] });
    return HttpResponse.json({ page: 1, totalPages: 1, results: accountFixtures() });
  }),
  http.get(`${origin}/v2/transactions`, ({ request }) => {
    const url = new URL(request.url);
    calls.push(`GET /v2/transactions${url.search}`);
    const accountId = url.searchParams.get('accountId') ?? '';
    return HttpResponse.json(transactionPage(accountId, url.searchParams));
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

function provider(): MeuPluggyProvider {
  return new MeuPluggyProvider({
    clientId: 'client-fixture',
    clientSecret: 'secret-fixture',
    itemIds: [MEUPLUGGY_DEMO_ITEM_ID],
    webhookToken,
  });
}

runProviderContractTests(() => ({
  provider: provider(),
  connectionId: MEUPLUGGY_DEMO_ITEM_ID,
}));

describe('Meu Pluggy adapter', () => {
  it('does not update or connect an item', async () => {
    const adapter = provider();
    await expect(adapter.createConnectToken('user')).rejects.toBeInstanceOf(NotSupportedError);
    await expect(adapter.revoke(MEUPLUGGY_DEMO_ITEM_ID)).rejects.toBeInstanceOf(NotSupportedError);
    await expect(adapter.triggerSync(MEUPLUGGY_DEMO_ITEM_ID)).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls.some((call) => call.startsWith('PATCH'))).toBe(false);
  });

  it('masks the account number and keeps the card limit in cents', async () => {
    const accounts = await provider().listAccounts(MEUPLUGGY_DEMO_ITEM_ID);
    const checking = accounts.find((account) => account.externalId === MEUPLUGGY_CHECKING_ID);
    const card = accounts.find((account) => account.externalId === MEUPLUGGY_CARD_ID);
    expect(checking?.number).toBe('****3450');
    expect(checking?.number).not.toContain('12345-0');
    expect(checking?.balanceCents).toBe(150_050);
    expect(card?.creditLimitCents).toBe(500_000);
    expect(card?.kind).toBe('CREDIT_CARD');
  });

  it('lists transactions from the cursor endpoint', async () => {
    calls.length = 0;
    const page = await provider().listTransactions(MEUPLUGGY_CHECKING_ID, {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-10-22T00:00:00.000Z'),
    });
    expect(page.nextCursor).toContain('after=');
    const listed = calls.find((call) => call.startsWith('GET /v2/transactions'));
    expect(listed).toContain('dateFrom=2026-01-01');
    expect(listed).toContain('dateTo=2026-10-22');
    expect(listed).not.toContain('pageSize');
    expect(calls.some((call) => call.startsWith('GET /transactions'))).toBe(false);
    await expect(
      provider().listTransactions(MEUPLUGGY_CHECKING_ID, { from: new Date(), to: new Date() }, '2'),
    ).rejects.toThrow('unknown cursor');
  });

  it('keeps the Pluggy status when the transaction list fails', async () => {
    server.use(
      http.get(`${origin}/v2/transactions`, () =>
        HttpResponse.json({ code: 'INVALID_DATE', message: 'date range is too wide' }, { status: 400 }),
      ),
    );
    await expect(
      provider().listTransactions(MEUPLUGGY_CHECKING_ID, { from: new Date('2025-01-01'), to: new Date('2026-10-22') }),
    ).rejects.toThrow('Provider unavailable (400): INVALID_DATE: date range is too wide');
  });

  it('copies the bill id and the installment from the card transaction', async () => {
    const page = await provider().listTransactions(MEUPLUGGY_CARD_ID, {
      from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      to: new Date(),
    });
    const installment = page.items.find((item) => item.externalId === 'card-installment');
    expect(installment?.installment).toEqual({ number: 2, total: 3 });
    expect(installment?.billExternalId).toBeTruthy();
    expect(installment?.amountCents).toBe(-8990);
  });

  it('accepts the three Pluggy events only when the url token matches', () => {
    const adapter = provider();
    const raw = JSON.stringify({
      event: 'transactions/created',
      itemId: MEUPLUGGY_DEMO_ITEM_ID,
      eventId: 'evt-1',
    });
    expect(adapter.parseWebhook({}, raw)).toBeNull();
    expect(adapter.parseWebhook({ [MEUPLUGGY_WEBHOOK_HEADER]: 'other-token' }, raw)).toBeNull();
    expect(adapter.parseWebhook({ [MEUPLUGGY_WEBHOOK_HEADER]: webhookToken }, raw)?.type).toBe(
      'TRANSACTIONS_AVAILABLE',
    );
    const updated = JSON.stringify({ event: 'item/updated', itemId: MEUPLUGGY_DEMO_ITEM_ID });
    expect(adapter.parseWebhook({ [MEUPLUGGY_WEBHOOK_HEADER]: webhookToken }, updated)?.type).toBe(
      'CONNECTION_UPDATED',
    );
    const failed = JSON.stringify({ event: 'item/error', itemId: MEUPLUGGY_DEMO_ITEM_ID });
    expect(adapter.parseWebhook({ [MEUPLUGGY_WEBHOOK_HEADER]: webhookToken }, failed)?.type).toBe(
      'CONNECTION_ERROR',
    );
  });

  it('turns an expired authorization into ProviderAuthError', async () => {
    const adapter = provider();
    const connection = await adapter.getConnection('consent-expired');
    expect(connection.authReason).toBe('consent_expired');
    expect(connection.status).toBe('LOGIN_ERROR');
    await expect(adapter.listAccounts('consent-expired')).rejects.toMatchObject({ reason: 'consent_expired' });
  });
});
