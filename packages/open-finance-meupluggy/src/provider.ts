import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type ConnectToken,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderTransaction,
  type TransactionPage,
  type TransactionRange,
  type WebhookEvent,
} from '@orcadom/open-finance-core';
import { NotSupportedError } from './errors.js';

export const MEUPLUGGY_PROVIDER_ID = 'meupluggy';
export const MEUPLUGGY_WEBHOOK_HEADER = 'x-meupluggy-webhook-token';
const API_KEY_TTL_MS = 110 * 60 * 1000;

export interface MeuPluggyConfig {
  clientId: string;
  clientSecret: string;
  itemIds: readonly string[];
  webhookToken: string;
  baseUrl?: string;
  now?: () => Date;
}

interface PluggyAccount {
  id?: string;
  type?: string;
  subtype?: string;
  number?: string;
  name?: string;
  balance?: number;
  currencyCode?: string;
  creditData?: { creditLimit?: number };
}

interface PluggyTransaction {
  id?: string;
  description?: string;
  descriptionRaw?: string | null;
  amount?: number;
  date?: string;
  category?: string;
  accountId?: string;
  creditCardMetadata?: {
    billId?: string;
    installmentNumber?: number;
    totalInstallments?: number;
  };
}

interface PluggyPage<T> {
  results?: T[];
  page?: number;
  totalPages?: number;
}

interface PluggyTransactionPage {
  results?: PluggyTransaction[];
  next?: string | null;
}

interface PluggyItem {
  id?: string;
  status?: string;
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  connector?: { name?: string };
  error?: { code?: string; message?: string } | null;
}

function maskNumber(value: string): string {
  if (/[x*]/i.test(value) && value.length <= 16) return value;
  const digits = value.replace(/\D/g, '');
  const tail = digits.slice(-4);
  return `****${tail || '0000'}`;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function dateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}

function mapKind(account: PluggyAccount): ProviderAccount['kind'] | null {
  const subtype = account.subtype ?? '';
  if (subtype === 'CREDIT_CARD' || account.type === 'CREDIT') return 'CREDIT_CARD';
  if (subtype === 'SAVINGS_ACCOUNT') return 'SAVINGS';
  if (subtype === 'CHECKING_ACCOUNT' || account.type === 'BANK') return 'CHECKING';
  return null;
}

function mapStatus(status: string | undefined): ProviderConnection['status'] {
  if (status === 'UPDATED') return 'ACTIVE';
  if (status === 'UPDATING') return 'UPDATING';
  if (status === 'LOGIN_ERROR') return 'LOGIN_ERROR';
  if (status === 'OUTDATED') return 'EXPIRED';
  return 'UPDATING';
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function sameSecret(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function consentExpired(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.code === 'USER_AUTHORIZATION_EXPIRED') return true;
  const error = body.error;
  return isRecord(error) && error.code === 'USER_AUTHORIZATION_EXPIRED';
}

function providerDetail(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const code = typeof body.code === 'string' || typeof body.code === 'number' ? String(body.code) : '';
  const message = typeof body.message === 'string' ? body.message : '';
  const text = [code, message]
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(': ')
    .slice(0, 180);
  return text || undefined;
}

function unavailableMessage(status: number, body: unknown): string {
  const detail = providerDetail(body);
  return detail ? `Provider unavailable (${String(status)}): ${detail}` : `Provider unavailable (${String(status)})`;
}

function retryAfter(response: Response, now: Date): Date {
  const header = response.headers.get('retry-after');
  if (!header) return new Date(now.getTime() + 30_000);
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return new Date(now.getTime() + seconds * 1000);
  const parsed = Date.parse(header);
  if (Number.isFinite(parsed)) return new Date(parsed);
  return new Date(now.getTime() + 30_000);
}

export class MeuPluggyProvider implements OpenFinanceProvider {
  readonly id = MEUPLUGGY_PROVIDER_ID;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private cachedKey: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: MeuPluggyConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://api.pluggy.ai').replace(/\/$/, '');
    this.now = config.now ?? (() => new Date());
  }

  createConnectToken(_userRef: string): Promise<ConnectToken> {
    return Promise.reject(new NotSupportedError('Connect the account at meu.pluggy.ai'));
  }

  revoke(_connectionId: string): Promise<void> {
    return Promise.reject(new NotSupportedError('Revoke the account in the Pluggy Dashboard'));
  }

  triggerSync(_connectionId: string): Promise<void> {
    return Promise.reject(new NotSupportedError('Meu Pluggy refreshes items every 24 hours'));
  }

  async getConnection(connectionId: string): Promise<ProviderConnection> {
    const item = await this.readJson<PluggyItem>(`/items/${encodeURIComponent(connectionId)}`);
    const authReason = item.error?.code === 'USER_AUTHORIZATION_EXPIRED' ? 'consent_expired' : undefined;
    const consent = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
    const lastSync = item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null;
    return {
      id: item.id ?? connectionId,
      status: mapStatus(item.status),
      institutionName: item.connector?.name ?? 'Meu Pluggy',
      lastSyncAt: lastSync && !Number.isNaN(lastSync.getTime()) ? lastSync : null,
      consentExpiresAt: consent && !Number.isNaN(consent.getTime()) ? consent : null,
      ...(authReason ? { authReason } : {}),
    };
  }

  async listAccounts(connectionId: string): Promise<ProviderAccount[]> {
    await this.assertReadable(connectionId);
    const accounts: ProviderAccount[] = [];
    let page = 1;
    for (let guard = 0; guard < 20; guard += 1) {
      const payload = await this.readJson<PluggyPage<PluggyAccount>>(
        `/accounts?itemId=${encodeURIComponent(connectionId)}&page=${String(page)}`,
      );
      for (const account of payload.results ?? []) {
        const mapped = this.mapAccount(account);
        if (mapped) accounts.push(mapped);
      }
      const total = payload.totalPages ?? 1;
      if (page >= total) return accounts;
      page += 1;
    }
    throw new ProviderUnavailableError('account pagination did not end');
  }

  async listTransactions(
    accountExternalId: string,
    range: TransactionRange,
    cursor?: string,
  ): Promise<TransactionPage> {
    const payload = await this.readJson<PluggyTransactionPage>(this.transactionPath(accountExternalId, range, cursor));
    const items = (payload.results ?? []).flatMap((transaction) => {
      const mapped = this.mapTransaction(transaction, accountExternalId);
      return mapped ? [mapped] : [];
    });
    const nextCursor = payload.next?.startsWith('?') ? payload.next : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }

  parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null {
    const presented = headerValue(headers, MEUPLUGGY_WEBHOOK_HEADER);
    if (!presented || !sameSecret(presented, this.config.webhookToken)) return null;
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
    if (!isRecord(body) || typeof body.event !== 'string') return null;
    const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : '';
    if (!itemId) return null;
    if (body.event === 'item/error') return { type: 'CONNECTION_ERROR', connectionId: itemId, payload: body };
    if (body.event === 'transactions/created') {
      return { type: 'TRANSACTIONS_AVAILABLE', connectionId: itemId, payload: body };
    }
    if (body.event === 'item/updated') return { type: 'CONNECTION_UPDATED', connectionId: itemId, payload: body };
    return { type: 'CONNECTION_UPDATED', connectionId: itemId, payload: body };
  }

  private async assertReadable(connectionId: string): Promise<void> {
    const connection = await this.getConnection(connectionId);
    if (connection.authReason === 'consent_expired') {
      throw new ProviderAuthError('The Meu Pluggy authorization expired', 'consent_expired');
    }
  }

  private mapAccount(account: PluggyAccount): ProviderAccount | null {
    if (!account.id || !account.name) return null;
    const kind = mapKind(account);
    if (!kind) return null;
    const limit = account.creditData?.creditLimit;
    return {
      externalId: account.id,
      kind,
      name: account.name,
      number: maskNumber(account.number ?? ''),
      currency: account.currencyCode ?? 'BRL',
      balanceCents: toCents(account.balance ?? 0),
      ...(kind === 'CREDIT_CARD' && typeof limit === 'number' ? { creditLimitCents: toCents(limit) } : {}),
    };
  }

  private mapTransaction(transaction: PluggyTransaction, accountExternalId: string): ProviderTransaction | null {
    if (!transaction.id || typeof transaction.amount !== 'number' || !transaction.date) return null;
    const date = new Date(transaction.date);
    if (Number.isNaN(date.getTime())) return null;
    const description = (transaction.description ?? transaction.descriptionRaw ?? '').trim();
    if (!description) return null;
    const metadata = transaction.creditCardMetadata;
    const installment =
      metadata?.installmentNumber && metadata.totalInstallments
        ? { number: metadata.installmentNumber, total: metadata.totalInstallments }
        : undefined;
    return {
      externalId: transaction.id,
      accountExternalId: transaction.accountId ?? accountExternalId,
      date,
      amountCents: toCents(transaction.amount),
      description,
      ...(transaction.category ? { rawCategory: transaction.category } : {}),
      ...(metadata?.billId ? { billExternalId: metadata.billId } : {}),
      ...(installment ? { installment } : {}),
    };
  }

  private async readJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) this.raise(response, body);
    return body as T;
  }

  private raise(response: Response, body: unknown): never {
    if (response.status === 401 || response.status === 403) {
      if (consentExpired(body)) {
        throw new ProviderAuthError('The Meu Pluggy authorization expired', 'consent_expired');
      }
      throw new ProviderAuthError();
    }
    if (response.status === 429) throw new ProviderRateLimitError(retryAfter(response, this.now()));
    throw new ProviderUnavailableError(unavailableMessage(response.status, body));
  }

  private transactionPath(accountExternalId: string, range: TransactionRange, cursor?: string): string {
    if (!cursor) {
      const params = new URLSearchParams({
        accountId: accountExternalId,
        dateFrom: dateKey(range.from),
        dateTo: dateKey(range.to),
      });
      return `/v2/transactions?${params.toString()}`;
    }
    if (!cursor.startsWith('?') || cursor.includes('://') || cursor.includes('#') || /\s/.test(cursor)) {
      throw new ProviderUnavailableError('unknown cursor');
    }
    return `/v2/transactions${cursor}`;
  }

  private async request(path: string, allowRefresh = true): Promise<Response> {
    const key = await this.apiKey();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'X-API-KEY': key },
    });
    if (response.status === 401 && allowRefresh) {
      this.cachedKey = null;
      return this.request(path, false);
    }
    return response;
  }

  private async apiKey(): Promise<string> {
    if (this.cachedKey && this.cachedKey.expiresAt > this.now().getTime() + 60_000) return this.cachedKey.value;
    const response = await fetch(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: this.config.clientId, clientSecret: this.config.clientSecret }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body) || typeof body.apiKey !== 'string' || !body.apiKey) {
      if (consentExpired(body)) {
        throw new ProviderAuthError('The Meu Pluggy authorization expired', 'consent_expired');
      }
      throw new ProviderAuthError();
    }
    this.cachedKey = { value: body.apiKey, expiresAt: this.now().getTime() + API_KEY_TTL_MS };
    return body.apiKey;
  }
}
