import type { ProviderTransaction } from '@orcadom/open-finance-core';
import { utcDateKey } from '../../common/calendar.js';
import { truncateDescription } from '../imports/parsers/shared.js';
import {
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
  listForMatch(householdId: string): Promise<LedgerTransaction[]>;
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
  const ordered = [...input.transactions].sort(
    (left, right) => left.date.getTime() - right.date.getTime() || left.externalId.localeCompare(right.externalId),
  );
  for (const transaction of ordered) {
    if (await ledger.hasExternal(input.providerId, transaction.externalId)) continue;
    if (!Number.isInteger(transaction.amountCents) || transaction.amountCents === 0) continue;
    const direction = transaction.amountCents < 0 ? 'out' : 'in';
    const amount = Math.abs(transaction.amountCents) / 100;
    const date = utcDateKey(transaction.date);
    const description = describeProviderTransaction(transaction);
    const posted = await ledger.listForMatch(input.householdId);
    const counterparts = posted.flatMap((row) => {
      const counterparty = toCounterparty(row);
      return counterparty ? [counterparty] : [];
    });
    const decision = matchImportRows(
      [{ lineId: transaction.externalId, date, amount, direction, description }],
      posted.map(toCandidate),
      [],
      input.localAccountId,
      counterparts,
    ).get(transaction.externalId);
    const match = decision?.matches[0];
    if (decision?.suggestedAction === 'RECORD_TRANSFER' && match?.kind === 'OWN_TRANSFER') {
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
      decision?.suggestedAction === 'SKIP' &&
      match &&
      (match.kind === 'TRANSFER_MIRROR' || match.kind === 'TRANSACTION')
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
