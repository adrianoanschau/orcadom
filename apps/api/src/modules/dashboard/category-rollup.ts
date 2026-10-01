export interface RolledCategory {
  categoryId: string;
  name: string;
  total: number;
  children: RolledCategory[];
}

export function rollupCategoryTotals(
  categories: readonly { id: string; name: string; parentId: string | null }[],
  spent: readonly { categoryId: string; total: number }[],
): RolledCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const rolled = new Map<string, number>();
  for (const row of spent) {
    let current: string | null = row.categoryId;
    const seen = new Set<string>();
    while (current && byId.has(current) && !seen.has(current)) {
      seen.add(current);
      rolled.set(current, (rolled.get(current) ?? 0) + row.total);
      current = byId.get(current)?.parentId ?? null;
    }
  }

  const nodes = new Map<string, RolledCategory>();
  for (const [id, total] of rolled) {
    const category = byId.get(id);
    if (!category || total === 0) continue;
    nodes.set(id, { categoryId: id, name: category.name, total, children: [] });
  }

  const roots: RolledCategory[] = [];
  for (const [id, node] of nodes) {
    const parentId = byId.get(id)?.parentId ?? null;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (list: RolledCategory[]) => {
    list.sort(
      (left, right) => right.total - left.total || left.name.localeCompare(right.name, 'pt-BR'),
    );
    for (const node of list) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}
