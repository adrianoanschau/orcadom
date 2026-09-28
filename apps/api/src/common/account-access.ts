import { NotFoundException } from '@nestjs/common';

export function accessibleAccountWhere(householdId: string, householdMemberId: string) {
  return {
    householdId,
    OR: [{ isRestricted: false }, { accountAccess: { some: { householdMemberId } } }],
  };
}

export function transactionTouchesAccessibleAccounts(accountIds: string[]) {
  return {
    OR: [
      { accountId: { in: accountIds } },
      { fromAccountId: { in: accountIds } },
      { toAccountId: { in: accountIds } },
    ],
  };
}

export function redactInaccessibleAccountId(
  accountId: string | null | undefined,
  accessibleIds: ReadonlySet<string>,
): string | null {
  if (!accountId || !accessibleIds.has(accountId)) return null;
  return accountId;
}

export interface AccountAccessReader {
  account: {
    findMany(args: {
      where: ReturnType<typeof accessibleAccountWhere>;
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
    findFirst(args: {
      where: { id: string } & ReturnType<typeof accessibleAccountWhere>;
      select?: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

export async function getAccessibleAccountIds(
  prisma: AccountAccessReader,
  householdId: string,
  householdMemberId: string,
): Promise<string[]> {
  const rows = await prisma.account.findMany({
    where: accessibleAccountWhere(householdId, householdMemberId),
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export function resolveRestrictMemberIds(requested: string[], actorMemberId: string) {
  return [...new Set([...requested, actorMemberId])];
}

export async function assertAccountAccessible(
  prisma: AccountAccessReader,
  householdId: string,
  householdMemberId: string,
  accountId: string,
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, ...accessibleAccountWhere(householdId, householdMemberId) },
    select: { id: true },
  });
  if (!account) {
    throw new NotFoundException('Conta não encontrada.');
  }
}
