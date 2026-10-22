import type { ProviderTransaction } from '@orcadom/open-finance-core';
import { addDaysKey, utcDateKey } from '../../common/calendar.js';
import { truncateDescription } from '../imports/parsers/shared.js';
import {
  RECONCILE_TX_DAYS,
  matchImportRows,
  type MatchCounterparty,
  type MatchTransactionCandidate,
} from '../imports/match-import-rows.js';

export interface LedgerTransaction {
  id: string;
  date: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  description: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  externalProvider: string | null;
  boundToProvider: boolean;
}

export interface LedgerMatchQuery {
  householdId: string;
  accountId: string;
  providerId: string;
  from: string;
  to: string;
}

export interface MovementInput {
  householdId: string;
  userId: string;
  providerId: string;
  externalId: string;
  accountId: string;
  direction: 'in' | 'out';
  amount: number;
  date: string;
  description: string;
}

export interface TransferConversion {
  transactionId: string;
  householdId: string;
  userId: string;
  providerId: string;
  externalId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
}

export interface OpenFinanceLedger {
  hasExternal(providerId: string, externalId: string): Promise<boolean>;
  listForMatch(query: LedgerMatchQuery): Promise<LedgerTransaction[]>;
  addMovement(input: MovementInput): Promise<void>;
  convertToTransfer(input: TransferConversion): Promise<void>;
  rememberExternal(providerId: string, externalId: string, transactionId: string): Promise<void>;
}

export function describeProviderTransaction(transaction: ProviderTransaction): string {
  const suffix = transaction.installment
    ? ` ${String(transaction.installment.number)}/${String(transaction.installment.total)}`
    : '';
  const withInstallment = suffix && !transaction.description.includes(suffix.trim())
    ? `${transaction.description}${suffix}`
    : transaction.description;
  return truncateDescription(withInstallment);
}

export function selectForMatch(
  transactions: readonly LedgerTransaction[],
  query: LedgerMatchQuery,
  hasProviderKey: (transactionId: string) => boolean,
): LedgerTransaction[] {
  return transactions
    .filter((transaction) => affectsAccount(transaction, query))
    .map((transaction) => ({
      ...transaction,
      boundToProvider: Boolean(transaction.externalProvider) || hasProviderKey(transaction.id),
    }));
}

function affectsAccount(transaction: LedgerTransaction, query: LedgerMatchQuery): boolean {
  if (transaction.date < query.from || transaction.date > query.to) return false;
  if (
    transaction.accountId === query.accountId ||
    transaction.fromAccountId === query.accountId ||
    transaction.toAccountId === query.accountId
  ) {
    return true;
  }
  return (
    transaction.accountId !== null &&
    transaction.accountId !== query.accountId &&
    (transaction.type === 'INCOME' || transaction.type === 'EXPENSE')
  );
}

function toCandidate(transaction: LedgerTransaction): MatchTransactionCandidate {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description,
    accountId: transaction.accountId,
    fromAccountId: transaction.fromAccountId,
    toAccountId: transaction.toAccountId,
    billId: null,
    billDescription: null,
    linked: transaction.type === 'TRANSFER',
  };
}

function toCounterparty(transaction: LedgerTransaction): MatchCounterparty | null {
  if ((transaction.type !== 'INCOME' && transaction.type !== 'EXPENSE') || !transaction.accountId) return null;
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName: transaction.description,
    date: transaction.date,
    amount: transaction.amount,
    direction: transaction.type === 'EXPENSE' ? 'out' : 'in',
  };
}

export async function importProviderTransactions(
  ledger: OpenFinanceLedger,
  input: {
    providerId: string;
    householdId: string;
    userId: string;
    localAccountId: string;
    transactions: readonly ProviderTransaction[];
  },
): Promise<void> {
  const pending: ProviderTransaction[] = [];
  for (const transaction of [...input.transactions].sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.externalId.localeCompare(right.externalId),
  )) {
    if (await ledger.hasExternal(input.providerId, transaction.externalId)) continue;
    if (!Number.isInteger(transaction.amountCents) || transaction.amountCents === 0) continue;
    pending.push(transaction);
  }
  if (pending.length === 0) return;

  const dates = pending.map((transaction) => utcDateKey(transaction.date));
  const earliest = dates.reduce((left, right) => (left < right ? left : right));
  const latest = dates.reduce((left, right) => (left > right ? left : right));
  const posted = await ledger.listForMatch({
    householdId: input.householdId,
    accountId: input.localAccountId,
    providerId: input.providerId,
    from: addDaysKey(earliest, -RECONCILE_TX_DAYS),
    to: addDaysKey(latest, RECONCILE_TX_DAYS),
  });
  const counterparts = posted.flatMap((row) => {
    const counterparty = toCounterparty(row);
    return counterparty ? [counterparty] : [];
  });
  const decisions = matchImportRows(
    pending.map((transaction) => ({
      lineId: transaction.externalId,
      date: utcDateKey(transaction.date),
      amount: Math.abs(transaction.amountCents) / 100,
      direction: transaction.amountCents < 0 ? ('out' as const) : ('in' as const),
      description: describeProviderTransaction(transaction),
    })),
    posted.filter((row) => !row.boundToProvider).map(toCandidate),
    [],
    input.localAccountId,
    counterparts,
    'link-existing',
  );

  for (const transaction of pending) {
    const direction = transaction.amountCents < 0 ? 'out' : 'in';
    const amount = Math.abs(transaction.amountCents) / 100;
    const date = utcDateKey(transaction.date);
    const description = describeProviderTransaction(transaction);
    const decision = decisions.get(transaction.externalId);
    const match = decision?.matches[0];
    if (!decision || !match) {
      await ledger.addMovement({
        householdId: input.householdId,
        userId: input.userId,
        providerId: input.providerId,
        externalId: transaction.externalId,
        accountId: input.localAccountId,
        direction,
        amount,
        date,
        description,
      });
      continue;
    }
    if (decision.suggestedAction === 'RECORD_TRANSFER' && match.kind === 'OWN_TRANSFER') {
      await ledger.convertToTransfer({
        transactionId: match.transactionId,
        householdId: input.householdId,
        userId: input.userId,
        providerId: input.providerId,
        externalId: transaction.externalId,
        fromAccountId: direction === 'out' ? input.localAccountId : match.accountId,
        toAccountId: direction === 'out' ? match.accountId : input.localAccountId,
        amount,
        date,
        description,
      });
      continue;
    }
    if (
      (decision.suggestedAction === 'SKIP' && (match.kind === 'TRANSFER_MIRROR' || match.kind === 'TRANSACTION')) ||
      (decision.suggestedAction === 'LINK_TRANSACTION' && match.kind === 'TRANSACTION')
    ) {
      await ledger.rememberExternal(input.providerId, transaction.externalId, match.transactionId);
      continue;
    }
    await ledger.addMovement({
      householdId: input.householdId,
      userId: input.userId,
      providerId: input.providerId,
      externalId: transaction.externalId,
      accountId: input.localAccountId,
      direction,
      amount,
      date,
      description,
    });
  }
}
