import { Prisma } from '@orcadom/database';
import { toDecimal } from '../../common/money.js';

export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const millis = date.getUTCMilliseconds();
  const firstOfMonth = new Date(Date.UTC(year, month, 1, hours, minutes, seconds, millis));
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      firstOfMonth.getUTCFullYear(),
      firstOfMonth.getUTCMonth(),
      Math.min(day, lastDay),
      hours,
      minutes,
      seconds,
      millis,
    ),
  );
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function startOfNextUtcDay(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function isDueOnOrBefore(date: Date, now = new Date()): boolean {
  return startOfUtcDay(date).getTime() <= startOfUtcDay(now).getTime();
}

export function generateInstallments(plan: {
  totalAmount: Prisma.Decimal | number | string;
  installmentsCount: number;
  purchaseDate: Date;
}) {
  const total = toDecimal(plan.totalAmount);
  const baseAmount = total.dividedBy(plan.installmentsCount).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const remainder = total.minus(baseAmount.times(plan.installmentsCount));

  return Array.from({ length: plan.installmentsCount }, (_, index) => {
    const isLast = index === plan.installmentsCount - 1;
    return {
      installmentNumber: index + 1,
      amount: isLast ? baseAmount.plus(remainder) : baseAmount,
      date: addUtcMonths(plan.purchaseDate, index),
    };
  });
}
