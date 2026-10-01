import { NotFoundException } from '@nestjs/common';
import { categoryAncestorIds, categorySubtreeIds } from '@orcadom/types';

export interface CategoryTreeReader {
  category: {
    findMany(args: {
      where: { householdId: string };
      select: { id: true; parentId: true };
    }): Promise<{ id: string; parentId: string | null }[]>;
  };
}

export async function getCategorySubtreeIds(
  prisma: CategoryTreeReader,
  householdId: string,
  categoryId: string,
): Promise<string[]> {
  const items = await loadCategories(prisma, householdId);
  if (!items.some((item) => item.id === categoryId)) {
    throw new NotFoundException('Categoria não encontrada.');
  }
  return categorySubtreeIds(items, categoryId);
}

export async function getCategoryAncestorIds(
  prisma: CategoryTreeReader,
  householdId: string,
  categoryId: string,
): Promise<string[]> {
  const items = await loadCategories(prisma, householdId);
  if (!items.some((item) => item.id === categoryId)) {
    throw new NotFoundException('Categoria não encontrada.');
  }
  return categoryAncestorIds(items, categoryId);
}

export async function categoryIdsForFilter(
  prisma: CategoryTreeReader,
  householdId: string,
  categoryId: string | undefined,
  includeDescendants: boolean | undefined,
): Promise<string[] | undefined> {
  if (!categoryId || includeDescendants === false) return undefined;
  return getCategorySubtreeIds(prisma, householdId, categoryId);
}

export function sumCategorySpent(
  spentByCategory: ReadonlyMap<string | null, number>,
  ids: readonly string[],
): number {
  return ids.reduce((total, id) => total + (spentByCategory.get(id) ?? 0), 0);
}

async function loadCategories(prisma: CategoryTreeReader, householdId: string) {
  return prisma.category.findMany({
    where: { householdId },
    select: { id: true, parentId: true },
  });
}
