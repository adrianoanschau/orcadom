import { describe, expect, it } from 'vitest';
import { toDecimal } from '../../common/money.js';
import { addUtcMonths, generateInstallments, isDueOnOrBefore } from './generate-installments.js';

describe('generateInstallments', () => {
  it('joga o centavo restante na última parcela', () => {
    const rows = generateInstallments({
      totalAmount: 100,
      installmentsCount: 3,
      purchaseDate: new Date('2026-01-15T12:00:00.000Z'),
    });
    expect(rows.map((row) => row.amount.toFixed(2))).toEqual(['33.33', '33.33', '33.34']);
    expect(rows.reduce((sum, row) => sum.plus(row.amount), toDecimal(0)).toFixed(2)).toBe('100.00');
    expect(rows.map((row) => row.installmentNumber)).toEqual([1, 2, 3]);
  });

  it('divide valores exatos sem resto', () => {
    const rows = generateInstallments({
      totalAmount: '90.00',
      installmentsCount: 3,
      purchaseDate: new Date('2026-01-15T12:00:00.000Z'),
    });
    expect(rows.map((row) => row.amount.toFixed(2))).toEqual(['30.00', '30.00', '30.00']);
  });

  it('avança o vencimento mês a mês em UTC', () => {
    const rows = generateInstallments({
      totalAmount: 100,
      installmentsCount: 3,
      purchaseDate: new Date('2026-01-15T12:00:00.000Z'),
    });
    expect(rows.map((row) => row.date.toISOString())).toEqual([
      '2026-01-15T12:00:00.000Z',
      '2026-02-15T12:00:00.000Z',
      '2026-03-15T12:00:00.000Z',
    ]);
  });
});

describe('addUtcMonths', () => {
  it('ajusta o dia quando o mês seguinte é mais curto', () => {
    expect(addUtcMonths(new Date('2026-01-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });
});

describe('isDueOnOrBefore', () => {
  it('considera o dia UTC, não o horário', () => {
    const date = new Date('2026-09-25T23:00:00.000Z');
    const now = new Date('2026-09-25T01:00:00.000Z');
    expect(isDueOnOrBefore(date, now)).toBe(true);
    expect(isDueOnOrBefore(new Date('2026-09-26T00:00:00.000Z'), now)).toBe(false);
  });
});
