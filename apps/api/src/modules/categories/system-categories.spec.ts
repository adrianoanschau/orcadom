import { describe, expect, it } from 'vitest';
import {
  CategoryType,
  SYSTEM_CATEGORIES,
  seedSystemCategories,
  type CategorySeedClient,
} from '@orcadom/database';

describe('seedSystemCategories', () => {
  it('tem 16 despesas e 6 receitas', () => {
    expect(SYSTEM_CATEGORIES.filter((category) => category.type === CategoryType.EXPENSE)).toHaveLength(16);
    expect(SYSTEM_CATEGORIES.filter((category) => category.type === CategoryType.INCOME)).toHaveLength(6);
  });

  it('não duplica ao rodar duas vezes no mesmo household', async () => {
    const store = new Map<string, { id: string; name: string; type: CategoryType }>();
    const tx: CategorySeedClient = {
      category: {
        upsert: ({ where, create }) => {
          const key = `${where.householdId_systemKey.householdId}:${where.householdId_systemKey.systemKey}`;
          const existing = store.get(key);
          if (existing) return existing;
          const row = { id: key, name: create.name, type: create.type };
          store.set(key, row);
          return row;
        },
      },
    };
    const first = await seedSystemCategories(tx, 'hh-1');
    const second = await seedSystemCategories(tx, 'hh-1');
    expect(store.size).toBe(22);
    expect(first.get('GROCERIES')?.id).toBe(second.get('GROCERIES')?.id);
    const other = await seedSystemCategories(tx, 'hh-2');
    expect(other.get('GROCERIES')?.id).not.toBe(first.get('GROCERIES')?.id);
    expect(store.size).toBe(44);
  });
});
