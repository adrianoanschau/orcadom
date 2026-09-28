import { describe, expect, it } from 'vitest';
import { buildTransactionListWhere } from './transaction-filters.js';

describe('buildTransactionListWhere', () => {
  it('sempre restringe ao household', () => {
    expect(buildTransactionListWhere('hh-1', {})).toEqual({ householdId: 'hh-1' });
  });

  it('aplica categoria e intervalo de datas', () => {
    const where = buildTransactionListWhere('hh-1', {
      categoryId: '11111111-1111-4111-8111-111111111111',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
    expect(where.categoryId).toBe('11111111-1111-4111-8111-111111111111');
    expect(where.date).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-30T23:59:59.999Z'),
    });
  });

  it('conta filtra origem, destino e conta principal', () => {
    const where = buildTransactionListWhere('hh-1', { accountId: 'acc-1' });
    expect(where.OR).toEqual([
      { accountId: 'acc-1' },
      { fromAccountId: 'acc-1' },
      { toAccountId: 'acc-1' },
    ]);
  });
});
