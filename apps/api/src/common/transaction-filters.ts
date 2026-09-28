import { transactionTouchesAccessibleAccounts } from './account-access.js';

export interface TransactionListFilters {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export function buildTransactionListWhere(
  householdId: string,
  query: TransactionListFilters,
  accessibleAccountIds?: string[],
) {
  const scoped =
    query.accountId && accessibleAccountIds && !accessibleAccountIds.includes(query.accountId);

  return {
    householdId,
    ...(scoped ? { id: { in: [] as string[] } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(!scoped && query.accountId
      ? {
          OR: [
            { accountId: query.accountId },
            { fromAccountId: query.accountId },
            { toAccountId: query.accountId },
          ],
        }
      : !scoped && accessibleAccountIds
        ? transactionTouchesAccessibleAccounts(accessibleAccountIds)
        : {}),
  };
}
