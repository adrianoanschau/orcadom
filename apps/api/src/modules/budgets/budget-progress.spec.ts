import { describe, expect, it } from 'vitest';
import {
  budgetStatus,
  computeBudgetProgress,
  isBudgetActiveOn,
  monthFromDate,
  monthStart,
  shouldEmitThreshold,
} from './budget-progress.js';

describe('budgetStatus', () => {
  it('marca on_track abaixo de 80%', () => {
    expect(budgetStatus(0)).toBe('on_track');
    expect(budgetStatus(0.79)).toBe('on_track');
  });

  it('marca warning a partir de 80%', () => {
    expect(budgetStatus(0.8)).toBe('warning');
    expect(budgetStatus(0.99)).toBe('warning');
  });

  it('marca exceeded a partir de 100%', () => {
    expect(budgetStatus(1)).toBe('exceeded');
    expect(budgetStatus(1.4)).toBe('exceeded');
  });
});

describe('computeBudgetProgress', () => {
  it('calcula gasto, ratio e status', () => {
    expect(computeBudgetProgress(480, 600)).toEqual({
      spent: 480,
      limit: 600,
      ratio: 0.8,
      status: 'warning',
    });
  });
});

describe('isBudgetActiveOn', () => {
  it('ignora categoria sem orçamento no mês', () => {
    const july = monthStart('2026-07');
    expect(isBudgetActiveOn(monthStart('2026-01'), monthStart('2026-07'), july)).toBe(false);
    expect(isBudgetActiveOn(monthStart('2026-07'), null, july)).toBe(true);
  });
});

describe('monthFromDate', () => {
  it('usa o mês UTC da transação', () => {
    expect(monthFromDate(new Date('2026-09-15T12:00:00.000Z'))).toBe('2026-09');
  });
});

describe('shouldEmitThreshold', () => {
  it('emite só na primeira entrada em warning ou exceeded', () => {
    expect(shouldEmitThreshold('on_track', 'warning')).toBe(true);
    expect(shouldEmitThreshold('warning', 'exceeded')).toBe(true);
    expect(shouldEmitThreshold(null, 'exceeded')).toBe(true);
    expect(shouldEmitThreshold('on_track', 'exceeded')).toBe(true);
  });

  it('não emite de novo na mesma faixa nem ao voltar', () => {
    expect(shouldEmitThreshold('warning', 'warning')).toBe(false);
    expect(shouldEmitThreshold('exceeded', 'exceeded')).toBe(false);
    expect(shouldEmitThreshold('exceeded', 'warning')).toBe(false);
    expect(shouldEmitThreshold('warning', 'on_track')).toBe(false);
    expect(shouldEmitThreshold(null, 'on_track')).toBe(false);
    expect(shouldEmitThreshold(null, null)).toBe(false);
  });
});
