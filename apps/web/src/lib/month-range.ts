export const MIN_MONTH_YEAR = 2000;

export function maxMonthYear(now = new Date()): number {
  return now.getFullYear() + 1;
}

export function parseMonthValue(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

export function toMonthValue(year: number, month: number): string {
  return `${String(year)}-${String(month + 1).padStart(2, '0')}`;
}

function monthIndex(year: number, month: number) {
  return year * 12 + month;
}

export function isMonthInWindow(value: string, now = new Date()): boolean {
  const parsed = parseMonthValue(value);
  if (!parsed) return false;
  const index = monthIndex(parsed.year, parsed.month);
  return index >= monthIndex(MIN_MONTH_YEAR, 0) && index <= monthIndex(maxMonthYear(now), 11);
}

export function shiftMonth(value: string, delta: number, now = new Date()): string {
  const parsed = parseMonthValue(value);
  if (!parsed || delta === 0) return value;
  const min = monthIndex(MIN_MONTH_YEAR, 0);
  const max = monthIndex(maxMonthYear(now), 11);
  const current = monthIndex(parsed.year, parsed.month);
  let next = current + delta;
  if (current >= min && current <= max) {
    next = Math.min(max, Math.max(min, next));
  } else if ((current < min && delta < 0) || (current > max && delta > 0)) {
    return value;
  }
  const year = Math.floor(next / 12);
  const month = next - year * 12;
  return toMonthValue(year, month);
}

export function canShiftYear(year: number, delta: number, now = new Date()): boolean {
  if (delta === 0) return false;
  const max = maxMonthYear(now);
  if (year < MIN_MONTH_YEAR) return delta > 0;
  if (year > max) return delta < 0;
  const next = year + delta;
  return next >= MIN_MONTH_YEAR && next <= max;
}
