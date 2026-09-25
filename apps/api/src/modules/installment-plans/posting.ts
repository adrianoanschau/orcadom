import { PostingStatus, type Prisma } from '@orcadom/database';
import { applyBalance, type BalanceWriter } from '../../common/balance.js';

export interface PostingRecord {
  id: string;
  postingStatus: string;
  type: string;
  amount: Prisma.Decimal | number | string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
}

export interface PostingWriter extends BalanceWriter {
  transaction: {
    findUnique(args: { where: { id: string } }): Promise<PostingRecord | null>;
    update(args: { where: { id: string }; data: { postingStatus: PostingStatus } }): Promise<unknown>;
  };
}

export function shouldPost(current: { postingStatus: string } | null): boolean {
  return current?.postingStatus === PostingStatus.SCHEDULED;
}

export async function postIfScheduled(tx: PostingWriter, id: string): Promise<'posted' | 'skipped'> {
  const current = await tx.transaction.findUnique({ where: { id } });
  if (!current || !shouldPost(current)) return 'skipped';
  await applyBalance(tx, current, 1);
  await tx.transaction.update({
    where: { id },
    data: { postingStatus: PostingStatus.POSTED },
  });
  return 'posted';
}
