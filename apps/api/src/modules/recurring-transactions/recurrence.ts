import {
  addUtcDays,
  addUtcMonths,
  startOfUtcDay,
} from '../installment-plans/generate-installments.js';

export const RECURRENCE_HORIZON_DAYS = 3;

export type RecurrenceFrequencyKind = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  frequency: RecurrenceFrequencyKind;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
}

export function withUtcDayOfMonth(date: Date, dayOfMonth: number): Date {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      Math.min(dayOfMonth, lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function calculateNextOccurrenceDate(
  rule: RecurrenceRule,
  lastOccurrenceDate: Date | null,
): Date {
  if (!lastOccurrenceDate) return rule.startDate;
  if (rule.frequency === 'WEEKLY') {
    return addUtcDays(lastOccurrenceDate, 7);
  }
  const months = rule.frequency === 'YEARLY' ? 12 : 1;
  const advanced = addUtcMonths(lastOccurrenceDate, months);
  const day = rule.dayOfMonth ?? rule.startDate.getUTCDate();
  return withUtcDayOfMonth(advanced, day);
}

export function occurrenceDatesUntil(
  rule: RecurrenceRule,
  lastOccurrenceDate: Date | null,
  horizon: Date,
): Date[] {
  const dates: Date[] = [];
  let last = lastOccurrenceDate;
  const horizonMs = horizon.getTime();
  const endMs = rule.endDate ? startOfUtcDay(rule.endDate).getTime() : null;

  while (dates.length < 400) {
    const next = calculateNextOccurrenceDate(rule, last);
    if (next.getTime() > horizonMs) break;
    if (endMs !== null && startOfUtcDay(next).getTime() > endMs) break;
    dates.push(next);
    last = next;
  }
  return dates;
}

export function recurrenceHorizon(now = new Date()): Date {
  return addUtcDays(now, RECURRENCE_HORIZON_DAYS);
}
