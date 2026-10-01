import { buildCategoryTree } from '@orcadom/types';

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

export interface CategoryRow {
  id: string;
  path: string;
  depth: number;
}

export const RECENT_CATEGORY_LIMIT = 5;

export function categoryPath(categories: readonly CategoryOption[], id: string): string {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const category = byId.get(current);
    if (!category) break;
    names.push(category.name);
    current = category.parentId;
  }
  return names.reverse().join(' › ');
}

export function orderedCategoryRows(categories: readonly CategoryOption[]): CategoryRow[] {
  const rows: CategoryRow[] = [];
  function walk(nodes: ReturnType<typeof buildCategoryTree<CategoryOption>>) {
    for (const node of nodes) {
      rows.push({
        id: node.item.id,
        path: categoryPath(categories, node.item.id),
        depth: node.depth,
      });
      walk(node.children);
    }
  }
  walk(buildCategoryTree(categories));
  return rows;
}

export function filterCategoryRows(rows: readonly CategoryRow[], query: string): CategoryRow[] {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  if (!needle) return rows.slice();
  return rows.filter((row) => row.path.toLocaleLowerCase('pt-BR').includes(needle));
}

export function recentCategoriesStorageKey(householdId: string): string {
  return `orcadom.recent-categories.${householdId}`;
}

export interface RecentCategoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseRecentCategoryIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0 || ids.includes(item)) continue;
      ids.push(item);
      if (ids.length === RECENT_CATEGORY_LIMIT) break;
    }
    return ids;
  } catch {
    return [];
  }
}

export function readRecentCategoryIds(
  storage: RecentCategoryStorage,
  householdId: string,
): string[] {
  return parseRecentCategoryIds(storage.getItem(recentCategoriesStorageKey(householdId)));
}

export function writeRecentCategoryIds(
  storage: RecentCategoryStorage,
  householdId: string,
  ids: readonly string[],
): void {
  storage.setItem(
    recentCategoriesStorageKey(householdId),
    JSON.stringify(ids.slice(0, RECENT_CATEGORY_LIMIT)),
  );
}

export function rememberCategoryId(ids: readonly string[], id: string): string[] {
  if (!id) return ids.slice(0, RECENT_CATEGORY_LIMIT);
  return [id, ...ids.filter((item) => item !== id)].slice(0, RECENT_CATEGORY_LIMIT);
}

export function visibleRecentCategoryIds(
  ids: readonly string[],
  knownIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const visible: string[] = [];
  for (const id of ids) {
    if (!knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    visible.push(id);
    if (visible.length === RECENT_CATEGORY_LIMIT) break;
  }
  return visible;
}
