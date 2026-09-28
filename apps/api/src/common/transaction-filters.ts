export interface TransactionListFilters {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export function buildTransactionListWhere(householdId: string, query: TransactionListFilters) {
  return {
    householdId,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.accountId
      ? {
          OR: [
            { accountId: query.accountId },
            { fromAccountId: query.accountId },
            { toAccountId: query.accountId },
          ],
        }
      : {}),
  };
}
