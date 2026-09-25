export const BUDGET_WARNING_RATIO = 0.8;

export type BudgetStatus = 'on_track' | 'warning' | 'exceeded';

export function monthStart(month: string): Date {
  const [yearText, monthText] = month.split('-');
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
}

export function monthEndExclusive(month: string): Date {
  const start = monthStart(month);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export function monthFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${String(year)}-${month}`;
}

export function isBudgetActiveOn(effectiveFrom: Date, effectiveTo: Date | null, at: Date): boolean {
  return effectiveFrom <= at && (effectiveTo === null || effectiveTo > at);
}

export function budgetRatio(spent: number, limit: number): number {
  if (limit <= 0) return spent > 0 ? Number.POSITIVE_INFINITY : 0;
  return spent / limit;
}

export function budgetStatus(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'exceeded';
  if (ratio >= BUDGET_WARNING_RATIO) return 'warning';
  return 'on_track';
}

export function computeBudgetProgress(spent: number, limit: number) {
  const ratio = budgetRatio(spent, limit);
  return {
    spent,
    limit,
    ratio,
    status: budgetStatus(ratio),
  };
}

export function shouldEmitThreshold(
  previous: BudgetStatus | null | undefined,
  current: BudgetStatus | null | undefined,
): current is Exclude<BudgetStatus, 'on_track'> {
  if (!current || current === 'on_track' || current === previous) return false;
  return previous !== 'exceeded';
}
