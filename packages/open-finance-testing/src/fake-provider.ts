import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CONTRACT_ERROR_IDS,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  webhookEventSchema,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
  type TransactionPage,
  type TransactionRange,
  type WebhookEvent,
} from '@orcadom/open-finance-core';

export const FAKE_CONNECTION_ID = 'connection-fake';
export const FAKE_CHECKING_ID = 'checking';
export const FAKE_CARD_ID = 'card';
export const FAKE_WEBHOOK_SECRET = 'orcadom-fake-open-finance-webhook';
export const FAKE_WEBHOOK_HEADER = 'x-open-finance-signature';
export const FAKE_BILL_CENTS = 250_000;

const PAGE_SIZE = 20;

export function signFakeWebhook(rawBody: string, secret = FAKE_WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function noonDaysAgo(now: Date, days: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 12, 0, 0));
}

function fixtures(now: Date): ProviderTransaction[] {
  const items: ProviderTransaction[] = [];
  for (let index = 0; index < 28; index += 1) {
    items.push({
      externalId: `checking:expense:${String(index)}`,
      accountExternalId: FAKE_CHECKING_ID,
      date: noonDaysAgo(now, 2 + (index % 45)),
      amountCents: -(1_000 + index * 37),
      description: `Compra ${String(index)}`,
      rawCategory: 'shopping',
    });
  }
  for (let index = 0; index < 28; index += 1) {
    items.push({
      externalId: `card:expense:${String(index)}`,
      accountExternalId: FAKE_CARD_ID,
      date: noonDaysAgo(now, 3 + (index % 40)),
      amountCents: -(2_000 + index * 41),
      description: `Cartão ${String(index)}`,
    });
  }
  const billDay = noonDaysAgo(now, 15);
  items.push({
    externalId: 'checking:bill-payment',
    accountExternalId: FAKE_CHECKING_ID,
    date: billDay,
    amountCents: -FAKE_BILL_CENTS,
    description: 'Pagamento fatura',
    billExternalId: 'bill-1',
  });
  items.push({
    externalId: 'card:bill-payment',
    accountExternalId: FAKE_CARD_ID,
    date: billDay,
    amountCents: FAKE_BILL_CENTS,
    description: 'Pagamento fatura',
    billExternalId: 'bill-1',
  });
  items.push({
    externalId: 'card:installment',
    accountExternalId: FAKE_CARD_ID,
    date: noonDaysAgo(now, 20),
    amountCents: -8_990,
    description: 'Mercado',
    installment: { number: 2, total: 3 },
  });
  items.push({
    externalId: 'checking:pix',
    accountExternalId: FAKE_CHECKING_ID,
    date: noonDaysAgo(now, 10),
    amountCents: 15_000,
    description: 'Pix recebido',
  });
  return items.sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.externalId.localeCompare(right.externalId),
  );
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function sameSignature(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function raiseIfErrorId(id: string): void {
  if (id === CONTRACT_ERROR_IDS.auth) throw new ProviderAuthError();
  if (id === CONTRACT_ERROR_IDS.rateLimit) throw new ProviderRateLimitError(new Date(Date.now() + 30_000));
  if (id === CONTRACT_ERROR_IDS.unavailable) throw new ProviderUnavailableError();
}

export class FakeOpenFinanceProvider implements OpenFinanceProvider {
  readonly id = 'fake';
  private readonly transactions: ProviderTransaction[];
  private status: ProviderConnection['status'] = 'ACTIVE';

  constructor(
    private readonly webhookSecret = FAKE_WEBHOOK_SECRET,
    now = new Date(),
  ) {
    this.transactions = fixtures(now);
  }

  createConnectToken(userRef: string): Promise<{ token: string; expiresAt: Date }> {
    return Promise.resolve().then(() => {
      if (!userRef) throw new ProviderAuthError();
      return {
        token: `fake.${userRef}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    });
  }

  getConnection(connectionId: string): Promise<ProviderConnection> {
    return Promise.resolve().then(() => {
      raiseIfErrorId(connectionId);
      if (connectionId !== FAKE_CONNECTION_ID) throw new ProviderAuthError();
      return {
        id: FAKE_CONNECTION_ID,
        status: this.status,
        institutionName: 'Banco Fake',
        lastSyncAt: null,
      };
    });
  }

  listAccounts(connectionId: string): Promise<ProviderAccount[]> {
    return Promise.resolve().then(() => {
      raiseIfErrorId(connectionId);
      if (connectionId !== FAKE_CONNECTION_ID) throw new ProviderAuthError();
      return [
        {
          externalId: FAKE_CHECKING_ID,
          kind: 'CHECKING',
          name: 'Conta corrente',
          number: '****1234',
          currency: 'BRL',
          balanceCents: 150_000,
        },
        {
          externalId: FAKE_CARD_ID,
          kind: 'CREDIT_CARD',
          name: 'Cartão',
          number: '****9876',
          currency: 'BRL',
          balanceCents: -80_000,
          creditLimitCents: 500_000,
        },
      ];
    });
  }

  listTransactions(
    accountExternalId: string,
    range: TransactionRange,
    cursor?: string,
  ): Promise<TransactionPage> {
    return Promise.resolve().then(() => {
      raiseIfErrorId(accountExternalId);
      const visible = this.transactions.filter(
        (item) =>
          item.accountExternalId === accountExternalId &&
          item.date.getTime() >= range.from.getTime() &&
          item.date.getTime() <= range.to.getTime(),
      );
      const start = cursor ? visible.findIndex((item) => item.externalId === cursor) + 1 : 0;
      if (cursor && start === 0) throw new ProviderUnavailableError('unknown cursor');
      const items = visible.slice(start, start + PAGE_SIZE);
      const last = items.at(-1);
      const nextCursor = start + PAGE_SIZE < visible.length && last ? last.externalId : undefined;
      return { items, ...(nextCursor ? { nextCursor } : {}) };
    });
  }

  parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null {
    const signature = header(headers, FAKE_WEBHOOK_HEADER);
    if (!signature) return null;
    const expected = signFakeWebhook(rawBody, this.webhookSecret);
    if (!sameSignature(signature, expected)) return null;
    try {
      return webhookEventSchema.parse(JSON.parse(rawBody) as unknown);
    } catch {
      return null;
    }
  }

  revoke(connectionId: string): Promise<void> {
    return Promise.resolve().then(() => {
      raiseIfErrorId(connectionId);
      if (connectionId !== FAKE_CONNECTION_ID) throw new ProviderAuthError();
      this.status = 'REVOKED';
    });
  }
}
