import { describe, expect, it } from 'vitest';
import { canShiftYear, isMonthInWindow, maxMonthYear, MIN_MONTH_YEAR, shiftMonth } from './month-range';

const now = new Date(2026, 5, 15);

describe('month window', () => {
  it('vai de 2000 até o ano corrente + 1, inclusive', () => {
    expect(MIN_MONTH_YEAR).toBe(2000);
    expect(maxMonthYear(now)).toBe(2027);
    expect(isMonthInWindow('2000-01', now)).toBe(true);
    expect(isMonthInWindow('2027-12', now)).toBe(true);
    expect(isMonthInWindow('1999-12', now)).toBe(false);
    expect(isMonthInWindow('2028-01', now)).toBe(false);
  });

  it('anda um mês e atravessa o ano', () => {
    expect(shiftMonth('2026-12', 1, now)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1, now)).toBe('2026-12');
  });

  it('anda três meses, o passo da coluna da grade', () => {
    expect(shiftMonth('2026-11', 3, now)).toBe('2027-02');
    expect(shiftMonth('2026-02', -3, now)).toBe('2025-11');
  });

  it('para em janeiro de 2000 e em dezembro do ano que vem', () => {
    expect(shiftMonth('2000-01', -1, now)).toBe('2000-01');
    expect(shiftMonth('2000-02', -3, now)).toBe('2000-01');
    expect(shiftMonth('2027-12', 1, now)).toBe('2027-12');
    expect(shiftMonth('2027-11', 3, now)).toBe('2027-12');
  });

  it('fora da janela, as setas só caminham para dentro', () => {
    expect(shiftMonth('1998-05', -1, now)).toBe('1998-05');
    expect(shiftMonth('1998-05', 1, now)).toBe('1998-06');
    expect(shiftMonth('2031-01', 1, now)).toBe('2031-01');
    expect(shiftMonth('2031-01', -1, now)).toBe('2030-12');
  });

  it('o ano da grade para na mesma borda', () => {
    expect(canShiftYear(2000, -1, now)).toBe(false);
    expect(canShiftYear(2000, 1, now)).toBe(true);
    expect(canShiftYear(2027, 1, now)).toBe(false);
    expect(canShiftYear(1999, -1, now)).toBe(false);
    expect(canShiftYear(1999, 1, now)).toBe(true);
    expect(canShiftYear(2028, 1, now)).toBe(false);
    expect(canShiftYear(2028, -1, now)).toBe(true);
  });
});
