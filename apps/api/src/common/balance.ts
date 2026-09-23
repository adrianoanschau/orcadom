import { TransactionType, type Prisma } from '@orcadom/database';
import { toDecimal } from './money.js';

export interface BalanceEntry {
  type: string;
  amount: Prisma.Decimal | number | string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
}

export interface BalanceWriter {
  account: {
    update(args: {
      where: { id: string };
      data: { balance: { increment: Prisma.Decimal } };
    }): Promise<unknown>;
  };
}

export async function applyBalance(
  tx: BalanceWriter,
  entry: BalanceEntry,
  direction: 1 | -1,
): Promise<void> {
  const amount = toDecimal(entry.amount).mul(direction);
  if (entry.type === TransactionType.INCOME && entry.accountId) {
    await tx.account.update({
      where: { id: entry.accountId },
      data: { balance: { increment: amount } },
    });
    return;
  }
  if (entry.type === TransactionType.EXPENSE && entry.accountId) {
    await tx.account.update({
      where: { id: entry.accountId },
      data: { balance: { increment: amount.neg() } },
    });
    return;
  }
  if (entry.type === TransactionType.TRANSFER && entry.fromAccountId && entry.toAccountId) {
    await tx.account.update({
      where: { id: entry.fromAccountId },
      data: { balance: { increment: amount.neg() } },
    });
    await tx.account.update({
      where: { id: entry.toAccountId },
      data: { balance: { increment: amount } },
    });
  }
}
