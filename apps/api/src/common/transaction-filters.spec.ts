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

  it('inclui a subárvore quando os ids são informados', () => {
    const where = buildTransactionListWhere(
      'hh-1',
      { categoryId: 'pai', includeDescendants: true },
      undefined,
      ['pai', 'filha'],
    );
    expect(where.categoryId).toEqual({ in: ['pai', 'filha'] });
  });

  it('respeita includeDescendants falso', () => {
    const where = buildTransactionListWhere(
      'hh-1',
      { categoryId: 'pai', includeDescendants: false },
      undefined,
      ['pai', 'filha'],
    );
    expect(where.categoryId).toBe('pai');
  });

  it('conta filtra origem, destino e conta principal', () => {
    const where = buildTransactionListWhere('hh-1', { accountId: 'acc-1' });
    expect(where.OR).toEqual([
      { accountId: 'acc-1' },
      { fromAccountId: 'acc-1' },
      { toAccountId: 'acc-1' },
    ]);
  });

  it('intersecta com as contas acessíveis quando não há filtro de conta', () => {
    const where = buildTransactionListWhere('hh-1', {}, ['acc-visivel']);
    expect(where.OR).toEqual([
      { accountId: { in: ['acc-visivel'] } },
      { fromAccountId: { in: ['acc-visivel'] } },
      { toAccountId: { in: ['acc-visivel'] } },
    ]);
  });

  it('filtro de conta inacessível não amplia o conjunto', () => {
    const where = buildTransactionListWhere('hh-1', { accountId: 'acc-secreta' }, ['acc-visivel']);
    expect(where.id).toEqual({ in: [] });
    expect(where.OR).toBeUndefined();
  });
});

