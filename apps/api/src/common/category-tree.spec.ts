import { describe, expect, it } from 'vitest';
import {
  MAX_CATEGORY_DEPTH,
  assessCategoryPlacement,
  buildCategoryTree,
  categorySubtreeIds,
  createCategorySchema,
} from '@orcadom/types';
import { sumCategorySpent } from './category-tree.js';
import { rollupCategoryTotals } from '../modules/dashboard/category-rollup.js';

const tree = [
  { id: 'mercado', parentId: null, type: 'EXPENSE' },
  { id: 'hortifruti', parentId: 'mercado', type: 'EXPENSE' },
  { id: 'folhas', parentId: 'hortifruti', type: 'EXPENSE' },
  { id: 'lazer', parentId: null, type: 'EXPENSE' },
  { id: 'salario', parentId: null, type: 'INCOME' },
];

describe('árvore de categorias', () => {
  it('rejeita filha com tipo diferente do pai', () => {
    expect(
      assessCategoryPlacement(tree, { parentId: 'mercado', type: 'INCOME' }),
    ).toMatchObject({ ok: false, reason: 'type_mismatch' });
  });

  it('rejeita ciclo ao mover', () => {
    expect(
      assessCategoryPlacement(tree, { id: 'mercado', parentId: 'hortifruti', type: 'EXPENSE' }),
    ).toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('rejeita estouro de profundidade ao criar e ao mover subárvore', () => {
    expect(MAX_CATEGORY_DEPTH).toBe(3);
    expect(
      assessCategoryPlacement(tree, { parentId: 'folhas', type: 'EXPENSE' }),
    ).toMatchObject({ ok: false, reason: 'depth' });
    expect(
      assessCategoryPlacement(tree, { id: 'hortifruti', parentId: 'lazer', type: 'EXPENSE' }).ok,
    ).toBe(true);
    const deep = [
      ...tree,
      { id: 'meio', parentId: 'lazer', type: 'EXPENSE' },
    ];
    expect(
      assessCategoryPlacement(deep, { id: 'hortifruti', parentId: 'meio', type: 'EXPENSE' }),
    ).toMatchObject({ ok: false, reason: 'depth' });
  });

  it('rejeita pai de outro household', () => {
    expect(
      assessCategoryPlacement(tree, { parentId: 'outro-household', type: 'EXPENSE' }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('soma a subárvore do pai e só a da filha', () => {
    const spent = new Map<string | null, number>([
      ['mercado', 10],
      ['hortifruti', 5],
      ['folhas', 2],
    ]);
    expect(sumCategorySpent(spent, categorySubtreeIds(tree, 'mercado'))).toBe(17);
    expect(sumCategorySpent(spent, categorySubtreeIds(tree, 'hortifruti'))).toBe(7);
    expect(sumCategorySpent(spent, categorySubtreeIds(tree, 'folhas'))).toBe(2);
  });

  it('monta a árvore a partir da lista plana', () => {
    const nodes = buildCategoryTree(tree);
    expect(nodes.map((node) => node.item.id)).toEqual(['mercado', 'lazer', 'salario']);
    expect(nodes[0]?.children[0]?.item.id).toBe('hortifruti');
    expect(nodes[0]?.children[0]?.depth).toBe(2);
  });

  it('ignora isSystem e systemKey no body', () => {
    const parsed = createCategorySchema.parse({
      name: 'Hortifruti',
      type: 'EXPENSE',
      isSystem: true,
      systemKey: 'GROCERIES',
    });
    expect(parsed).toEqual({ name: 'Hortifruti', type: 'EXPENSE' });
  });
});

describe('rollup do dashboard', () => {
  it('agrega até a raiz e guarda os filhos', () => {
    const rolled = rollupCategoryTotals(
      [
        { id: 'mercado', name: 'Mercado', parentId: null },
        { id: 'hortifruti', name: 'Hortifruti', parentId: 'mercado' },
      ],
      [
        { categoryId: 'mercado', total: 10 },
        { categoryId: 'hortifruti', total: 5 },
      ],
    );
    expect(rolled).toEqual([
      {
        categoryId: 'mercado',
        name: 'Mercado',
        total: 15,
        children: [{ categoryId: 'hortifruti', name: 'Hortifruti', total: 5, children: [] }],
      },
    ]);
  });
});
