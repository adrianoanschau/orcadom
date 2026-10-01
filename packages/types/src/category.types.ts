import { z } from 'zod';

export const MAX_CATEGORY_DEPTH = 3;

export const categoryTypeSchema = z.enum(['INCOME', 'EXPENSE']);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: categoryTypeSchema,
  icon: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  parentId: z.uuid().optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    icon: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.icon !== undefined ||
      value.color !== undefined ||
      value.parentId !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  );

export const listCategoriesQuerySchema = z.object({
  type: categoryTypeSchema.optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export interface CategoryTreeNode<T> {
  item: T;
  depth: number;
  children: CategoryTreeNode<T>[];
}

export function buildCategoryTree<T extends { id: string; parentId: string | null }>(
  items: readonly T[],
): CategoryTreeNode<T>[] {
  const ids = new Set(items.map((item) => item.id));
  const byParent = new Map<string | null, T[]>();
  for (const item of items) {
    const parentId = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(item);
    byParent.set(parentId, siblings);
  }

  function walk(parentId: string | null, depth: number): CategoryTreeNode<T>[] {
    return (byParent.get(parentId) ?? []).map((item) => ({
      item,
      depth,
      children: walk(item.id, depth + 1),
    }));
  }

  return walk(null, 1);
}

export interface CategoryLink {
  id: string;
  parentId: string | null;
  type: string;
}

export type CategoryPlacementFailure = 'missing_parent' | 'type_mismatch' | 'cycle' | 'depth';

export type CategoryPlacement =
  | { ok: true; depth: number }
  | { ok: false; reason: CategoryPlacementFailure };

export function categoryDepth(
  items: readonly { id: string; parentId: string | null }[],
  id: string,
): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  let depth = 0;
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentId ?? null;
  }
  return depth;
}

export function categorySubtreeIds(
  items: readonly { id: string; parentId: string | null }[],
  id: string,
): string[] {
  const childrenOf = childrenIndex(items);
  const result: string[] = [];
  const walk = (current: string, seen: Set<string>) => {
    if (seen.has(current)) return;
    seen.add(current);
    result.push(current);
    for (const child of childrenOf.get(current) ?? []) walk(child, seen);
  };
  walk(id, new Set());
  return result;
}

export function categoryAncestorIds(
  items: readonly { id: string; parentId: string | null }[],
  id: string,
): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: string[] = [];
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    result.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return result;
}

export function assessCategoryPlacement(
  items: readonly CategoryLink[],
  input: { id?: string; parentId: string | null; type: string },
): CategoryPlacement {
  const byId = new Map(items.map((item) => [item.id, item]));
  let parentDepth = 0;
  if (input.parentId) {
    const parent = byId.get(input.parentId);
    if (!parent) return { ok: false, reason: 'missing_parent' };
    if (parent.type !== input.type) return { ok: false, reason: 'type_mismatch' };
    if (input.id && categorySubtreeIds(items, input.id).includes(input.parentId)) {
      return { ok: false, reason: 'cycle' };
    }
    parentDepth = categoryDepth(items, input.parentId);
  }
  const span = input.id ? subtreeSpan(items, input.id) : 1;
  if (parentDepth + span > MAX_CATEGORY_DEPTH) return { ok: false, reason: 'depth' };
  return { ok: true, depth: parentDepth + 1 };
}

function childrenIndex(items: readonly { id: string; parentId: string | null }[]) {
  const childrenOf = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const children = childrenOf.get(item.parentId) ?? [];
    children.push(item.id);
    childrenOf.set(item.parentId, children);
  }
  return childrenOf;
}

function subtreeSpan(items: readonly { id: string; parentId: string | null }[], id: string): number {
  const childrenOf = childrenIndex(items);
  const span = (current: string, seen: Set<string>): number => {
    if (seen.has(current)) return 1;
    const next = new Set(seen);
    next.add(current);
    const children = childrenOf.get(current) ?? [];
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map((child) => span(child, next)));
  };
  return span(id, new Set());
}
