import { describe, expect, it } from 'vitest';
import {
  calculateNextOccurrenceDate,
  occurrenceDatesUntil,
  type RecurrenceRule,
} from './recurrence.js';

const weekly: RecurrenceRule = {
  frequency: 'WEEKLY',
  dayOfMonth: null,
  startDate: new Date('2026-01-15T12:00:00.000Z'),
  endDate: null,
};

const monthly: RecurrenceRule = {
  frequency: 'MONTHLY',
  dayOfMonth: 31,
  startDate: new Date('2026-01-31T12:00:00.000Z'),
  endDate: null,
};

const yearly: RecurrenceRule = {
  frequency: 'YEARLY',
  dayOfMonth: 1,
  startDate: new Date('2026-03-01T12:00:00.000Z'),
  endDate: null,
};

describe('calculateNextOccurrenceDate', () => {
  it('usa a data de início quando ainda não há ocorrência', () => {
    expect(calculateNextOccurrenceDate(weekly, null).toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('avança uma semana', () => {
    expect(calculateNextOccurrenceDate(weekly, weekly.startDate).toISOString()).toBe(
      '2026-01-22T12:00:00.000Z',
    );
  });

  it('ajusta mês curto para o último dia', () => {
    expect(calculateNextOccurrenceDate(monthly, monthly.startDate).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('avança um ano', () => {
    expect(calculateNextOccurrenceDate(yearly, yearly.startDate).toISOString()).toBe(
      '2027-03-01T12:00:00.000Z',
    );
  });
});

describe('occurrenceDatesUntil', () => {
  it('recupera ocorrências atrasadas, não só a próxima', () => {
    const dates = occurrenceDatesUntil(weekly, null, new Date('2026-01-25T12:00:00.000Z'));
    expect(dates.map((date) => date.toISOString())).toEqual([
      '2026-01-15T12:00:00.000Z',
      '2026-01-22T12:00:00.000Z',
    ]);
  });

  it('respeita a data de fim', () => {
    const dates = occurrenceDatesUntil(
      { ...weekly, endDate: new Date('2026-01-15T12:00:00.000Z') },
      null,
      new Date('2026-02-01T12:00:00.000Z'),
    );
    expect(dates.map((date) => date.toISOString())).toEqual(['2026-01-15T12:00:00.000Z']);
  });
});
