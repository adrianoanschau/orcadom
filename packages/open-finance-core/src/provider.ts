import type { ConnectToken, ProviderAccount, ProviderConnection, ProviderTransaction, WebhookEvent } from './schemas.js';

export interface TransactionRange {
  from: Date;
  to: Date;
}

export interface TransactionPage {
  items: ProviderTransaction[];
  nextCursor?: string;
}

export interface OpenFinanceProvider {
  readonly id: string;
  createConnectToken(userRef: string): Promise<ConnectToken>;
  getConnection(connectionId: string): Promise<ProviderConnection>;
  listAccounts(connectionId: string): Promise<ProviderAccount[]>;
  listTransactions(
    accountExternalId: string,
    range: TransactionRange,
    cursor?: string,
  ): Promise<TransactionPage>;
  parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null;
  revoke(connectionId: string): Promise<void>;
}
