import { Prisma } from '@orcadom/database';

export function toDecimal(value: number | Prisma.Decimal | string): Prisma.Decimal {
  if (typeof value === 'number') {
    return new Prisma.Decimal(value.toFixed(2));
  }
  return new Prisma.Decimal(value.toString());
}

export function moneyString(value: { toFixed(digits: number): string } | null | undefined): string {
  return value ? value.toFixed(2) : '0.00';
}
