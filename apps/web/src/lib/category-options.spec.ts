import { describe, expect, it } from 'vitest';
import {
  filterCategoryRows,
  orderedCategoryRows,
  parseRecentCategoryIds,
  readRecentCategoryIds,
  rememberCategoryId,
  visibleRecentCategoryIds,
  writeRecentCategoryIds,
  type CategoryOption,
  type RecentCategoryStorage,
} from './category-options';

const categories: CategoryOption[] = [
  { id: 'home', name: 'Casa', parentId: null, depth: 1 },
  { id: 'food', name: 'Alimentação', parentId: null, depth: 1 },
  { id: 'market', name: 'Mercado', parentId: 'food', depth: 2 },
  { id: 'produce', name: 'Hortifruti', parentId: 'market', depth: 3 },
];

describe('category tree', () => {
  it('segue o pré-ordem da árvore, com irmãs na ordem da API', () => {
    expect(orderedCategoryRows(categories).map((row) => row.id)).toEqual([
      'home',
      'food',
      'market',
      'produce',
    ]);
    expect(orderedCategoryRows(categories).map((row) => row.depth)).toEqual([1, 1, 2, 3]);
  });

  it('filtra pelo caminho em pt-BR e preserva a ordem', () => {
    const rows = orderedCategoryRows(categories);
    expect(filterCategoryRows(rows, '  ALIMENTAÇÃO ').map((row) => row.id)).toEqual([
      'food',
      'market',
      'produce',
    ]);
    expect(filterCategoryRows(rows, 'hort').map((row) => row.path)).toEqual([
      'Alimentação › Mercado › Hortifruti',
    ]);
    expect(filterCategoryRows(rows, 'inexistente')).toEqual([]);
  });
});

describe('recent categories', () => {
  it('guarda no máximo cinco ids, o mais novo primeiro', () => {
    let ids: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) ids = rememberCategoryId(ids, id);
    expect(ids).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(rememberCategoryId(ids, 'c')).toEqual(['c', 'f', 'e', 'd', 'b']);
    expect(rememberCategoryId(ids, '')).toEqual(ids);
  });

  it('descarta ids que não existem mais e ignora armazenamento inválido', () => {
    expect(
      visibleRecentCategoryIds(['gone', 'food', 'gone', 'home'], new Set(['food', 'home'])),
    ).toEqual(['food', 'home']);
    expect(parseRecentCategoryIds(null)).toEqual([]);
    expect(parseRecentCategoryIds('nope')).toEqual([]);
    expect(parseRecentCategoryIds(JSON.stringify(['a', 1, 'a', '', 'b']))).toEqual(['a', 'b']);
  });

  it('lê e grava numa lista injetada, sem o localStorage do browser', () => {
    const memory = new Map<string, string>();
    const storage: RecentCategoryStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
    writeRecentCategoryIds(storage, 'house-1', rememberCategoryId([], 'food'));
    expect(readRecentCategoryIds(storage, 'house-1')).toEqual(['food']);
    expect(memory.has('orcadom.recent-categories.house-1')).toBe(true);
    expect(readRecentCategoryIds(storage, 'other')).toEqual([]);
  });
});
