import { normalizeDescription } from '../../common/category-memory.js';
import { daysBetween } from '../../common/calendar.js';

export const RECONCILE_TX_DAYS = 3;
export const BILL_MATCH_TIGHT = { before: 5, after: 15 };
export const BILL_MATCH_WIDE = { before: 10, after: 45 };
export const BILL_AMOUNT_TOLERANCE = 0.15;

export type MatchConfidence = 'high' | 'low';
export type SuggestedImportAction = 'IMPORT' | 'SKIP' | 'LINK_TRANSACTION' | 'PAY_BILL' | 'RECORD_TRANSFER';
/** `confirm` keeps file import asking the user. `link-existing` is the Open Finance sync. */
export type ImportMatchStrategy = 'confirm' | 'link-existing';

export interface MatchLine {
  lineId: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  description: string;
}

export interface MatchTransactionCandidate {
  id: string;
  date: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  description: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  billId: string | null;
  billDescription: string | null;
  linked?: boolean;
}

export interface MatchCounterparty {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
}

export interface MatchBillCandidate {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  targetAccountId: string | null;
}

export type RowMatch =
  | {
      kind: 'TRANSACTION';
      transactionId: string;
      billId: string | null;
      description: string;
      date: string;
      amount: string;
      matchConfidence: MatchConfidence;
    }
  | {
      kind: 'BILL';
      billId: string;
      description: string;
      dueDate: string;
      billAmount: string;
      matchConfidence: MatchConfidence;
    }
  | {
      kind: 'TRANSFER_MIRROR';
      transactionId: string;
      description: string;
      date: string;
      amount: string;
      linked: boolean;
      matchConfidence: MatchConfidence;
    }
  | {
      kind: 'OWN_TRANSFER';
      transactionId: string;
      accountId: string;
      accountName: string;
      description: string;
      date: string;
      amount: string;
      matchConfidence: MatchConfidence;
    };

export interface RowReconciliation {
  matches: RowMatch[];
  suggestedAction: SuggestedImportAction;
}

function money(value: number): string {
  return value.toFixed(2);
}

function within(distance: number, before: number, after: number): boolean {
  return distance >= -before && distance <= after;
}

function amountClose(left: number, right: number): boolean {
  if (right === 0) return left === 0;
  return Math.abs(left - right) / right <= BILL_AMOUNT_TOLERANCE;
}

function descriptionScore(left: string, right: string): number {
  const a = normalizeDescription(left);
  const b = normalizeDescription(right);
  if (!a || !b) return 0;
  if (a === b) return 2;
  if (a.includes(b) || b.includes(a)) return 1;
  return 0;
}

export function matchImportRows(
  lines: readonly MatchLine[],
  transactions: readonly MatchTransactionCandidate[],
  bills: readonly MatchBillCandidate[],
  accountId: string,
  counterparts: readonly MatchCounterparty[] = [],
  strategy: ImportMatchStrategy = 'confirm',
): Map<string, RowReconciliation> {
  const ordered = [...lines].sort((left, right) => left.date.localeCompare(right.date) || left.lineId.localeCompare(right.lineId));
  const claimed = new Set<string>();
  const result = new Map<string, RowReconciliation>();

  for (const line of ordered) {
    const options = candidatesFor(line, transactions, bills, counterparts, accountId).filter(
      (match) => !claimed.has(claimKey(match)),
    );
    const high = options.filter((match) => match.matchConfidence === 'high');
    const chosen = pickClosest(line, options);
    const onlyHigh = high[0];
    if (high.length === 1 && onlyHigh && chosen && claimKey(onlyHigh) === claimKey(chosen)) {
      claimed.add(claimKey(chosen));
      result.set(line.lineId, {
        matches: [chosen],
        suggestedAction: actionFor(chosen),
      });
      continue;
    }
    const ownTransfer = sameAccountTransfer(line, options);
    if (ownTransfer) {
      claimed.add(claimKey(ownTransfer));
      result.set(line.lineId, {
        matches: [{ ...ownTransfer, matchConfidence: 'high' }],
        suggestedAction: 'RECORD_TRANSFER',
      });
      continue;
    }
    const linked = strategy === 'link-existing' ? linkExistingTransaction(line, options) : null;
    if (linked) {
      claimed.add(claimKey(linked));
      result.set(line.lineId, {
        matches: [{ ...linked, matchConfidence: 'high' }],
        suggestedAction: 'LINK_TRANSACTION',
      });
      continue;
    }
    result.set(line.lineId, {
      matches: options.map((match) => ({ ...match, matchConfidence: 'low' as const })),
      suggestedAction: 'IMPORT',
    });
  }

  return result;
}

function sameAccountTransfer(line: MatchLine, options: readonly RowMatch[]): RowMatch | null {
  if (options.some((match) => match.matchConfidence === 'high' && match.kind !== 'OWN_TRANSFER')) return null;
  const transfers = options.filter((match) => match.kind === 'OWN_TRANSFER');
  const accountIds = new Set(transfers.map((match) => match.accountId));
  if (accountIds.size !== 1) return null;
  return pickClosest(line, transfers);
}

function linkExistingTransaction(line: MatchLine, options: readonly RowMatch[]): RowMatch | null {
  const blocked = options.some((match) => match.matchConfidence === 'high' && match.kind !== 'TRANSACTION');
  if (blocked) return null;
  const transactions = options.filter((match) => match.kind === 'TRANSACTION');
  return pickClosest(line, transactions);
}

function claimKey(match: RowMatch): string {
  if (match.kind === 'BILL') return `bill:${match.billId}`;
  return `tx:${match.transactionId}`;
}

function actionFor(match: RowMatch): SuggestedImportAction {
  if (match.kind === 'BILL') return 'PAY_BILL';
  if (match.kind === 'OWN_TRANSFER') return 'RECORD_TRANSFER';
  if (match.kind === 'TRANSFER_MIRROR') return 'SKIP';
  if (match.matchConfidence === 'high') return 'LINK_TRANSACTION';
  return 'IMPORT';
}

function pickClosest(line: MatchLine, matches: RowMatch[]): RowMatch | null {
  if (matches.length === 0) return null;
  const ranked = [...matches].sort((left, right) => {
    const distance = Math.abs(distanceOf(line, left)) - Math.abs(distanceOf(line, right));
    if (distance !== 0) return distance;
    const text = descriptionScore(line.description, right.description) - descriptionScore(line.description, left.description);
    if (text !== 0) return text;
    return claimKey(left).localeCompare(claimKey(right));
  });
  return ranked[0] ?? null;
}

function distanceOf(line: MatchLine, match: RowMatch): number {
  const target = match.kind === 'BILL' ? match.dueDate : match.date;
  return daysBetween(target, line.date);
}

function candidatesFor(
  line: MatchLine,
  transactions: readonly MatchTransactionCandidate[],
  bills: readonly MatchBillCandidate[],
  counterparts: readonly MatchCounterparty[],
  accountId: string,
): RowMatch[] {
  const matches: RowMatch[] = [];
  const txHits = transactions.filter((candidate) => transactionFits(line, candidate, accountId));
  const mirrors = transactions.filter((candidate) => mirrorFits(line, candidate, accountId));
  const billHits = line.direction === 'out' ? bills.filter((candidate) => billFits(line, candidate)) : [];

  const uniqueTx = txHits.length === 1 ? txHits[0] : null;
  for (const candidate of txHits) {
    const fromBill = Boolean(candidate.billId);
    const high = uniqueTx?.id === candidate.id && fromBill;
    matches.push({
      kind: 'TRANSACTION',
      transactionId: candidate.id,
      billId: candidate.billId,
      description: candidate.billDescription ?? candidate.description,
      date: candidate.date,
      amount: money(candidate.amount),
      matchConfidence: high ? 'high' : 'low',
    });
  }

  const uniqueMirror = mirrors.length === 1 ? mirrors[0] : null;
  for (const candidate of mirrors) {
    const high = uniqueMirror?.id === candidate.id && (Boolean(candidate.billId) || Boolean(candidate.linked));
    matches.push({
      kind: 'TRANSFER_MIRROR',
      transactionId: candidate.id,
      description: candidate.description,
      date: candidate.date,
      amount: money(candidate.amount),
      linked: Boolean(candidate.linked),
      matchConfidence: high ? 'high' : 'low',
    });
  }

  const exactTight = billHits.filter(
    (candidate) =>
      candidate.amount === line.amount &&
      within(daysBetween(candidate.dueDate, line.date), BILL_MATCH_TIGHT.before, BILL_MATCH_TIGHT.after),
  );
  for (const candidate of billHits) {
    const high = exactTight.length === 1 && exactTight[0]?.id === candidate.id;
    matches.push({
      kind: 'BILL',
      billId: candidate.id,
      description: candidate.description,
      dueDate: candidate.dueDate,
      billAmount: money(candidate.amount),
      matchConfidence: high ? 'high' : 'low',
    });
  }

  const alreadyTransfer = Boolean(uniqueMirror ?? uniqueTx?.type === 'TRANSFER');
  if (!alreadyTransfer) {
    const opposite = counterparts.filter((candidate) => counterpartyFits(line, candidate, accountId));
    const only = opposite.length === 1 ? opposite[0] : null;
    for (const candidate of opposite) {
      matches.push({
        kind: 'OWN_TRANSFER',
        transactionId: candidate.id,
        accountId: candidate.accountId,
        accountName: candidate.accountName,
        description: candidate.accountName,
        date: candidate.date,
        amount: money(candidate.amount),
        matchConfidence: only?.id === candidate.id ? 'high' : 'low',
      });
    }
  }

  return matches;
}

function transactionFits(
  line: MatchLine,
  candidate: MatchTransactionCandidate,
  accountId: string,
): boolean {
  if (candidate.amount !== line.amount) return false;
  if (Math.abs(daysBetween(candidate.date, line.date)) > RECONCILE_TX_DAYS) return false;
  if (line.direction === 'out') {
    if (candidate.type === 'EXPENSE') return candidate.accountId === accountId;
    if (candidate.type === 'TRANSFER') return candidate.fromAccountId === accountId && !candidate.linked;
    return false;
  }
  if (candidate.type === 'INCOME') return candidate.accountId === accountId;
  return false;
}

function mirrorFits(line: MatchLine, candidate: MatchTransactionCandidate, accountId: string): boolean {
  if (candidate.type !== 'TRANSFER' || candidate.amount !== line.amount) return false;
  if (Math.abs(daysBetween(candidate.date, line.date)) > RECONCILE_TX_DAYS) return false;
  if (line.direction === 'in' && candidate.toAccountId === accountId) return true;
  return line.direction === 'out' && candidate.fromAccountId === accountId && Boolean(candidate.linked);
}

function counterpartyFits(line: MatchLine, candidate: MatchCounterparty, accountId: string): boolean {
  if (candidate.accountId === accountId || candidate.amount !== line.amount) return false;
  if (Math.abs(daysBetween(candidate.date, line.date)) > RECONCILE_TX_DAYS) return false;
  return line.direction === 'in' ? candidate.direction === 'out' : candidate.direction === 'in';
}

function billFits(line: MatchLine, candidate: MatchBillCandidate): boolean {
  const distance = daysBetween(candidate.dueDate, line.date);
  const wide = within(distance, BILL_MATCH_WIDE.before, BILL_MATCH_WIDE.after);
  if (!wide) return false;
  return candidate.amount === line.amount || amountClose(line.amount, candidate.amount);
}
