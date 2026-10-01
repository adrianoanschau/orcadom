import { Injectable } from '@nestjs/common';
import { PostingStatus, TransactionType } from '@orcadom/database';
import {
  getAccessibleAccountIds,
  transactionTouchesAccessibleAccounts,
} from '../../common/account-access.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { rollupCategoryTotals, type RolledCategory } from './category-rollup.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(householdId: string, householdMemberId: string, month: string) {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1));
    const period = { gte: start, lt: end };
    const accountIds = await getAccessibleAccountIds(this.prisma.client, householdId, householdMemberId);
    const visibleTx = transactionTouchesAccessibleAccounts(accountIds);

    const [income, expense, balance, grouped, scheduled, categories] = await Promise.all([
      this.prisma.client.transaction.aggregate({
        where: { householdId, type: TransactionType.INCOME, date: period, ...visibleTx },
        _sum: { amount: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: { householdId, type: TransactionType.EXPENSE, date: period, ...visibleTx },
        _sum: { amount: true },
      }),
      this.prisma.client.account.aggregate({
        where: { householdId, id: { in: accountIds } },
        _sum: { balance: true },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['categoryId'],
        where: {
          householdId,
          type: TransactionType.EXPENSE,
          date: period,
          categoryId: { not: null },
          ...visibleTx,
        },
        _sum: { amount: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: {
          householdId,
          type: TransactionType.EXPENSE,
          postingStatus: PostingStatus.SCHEDULED,
          ...visibleTx,
        },
        _sum: { amount: true },
      }),
      this.prisma.client.category.findMany({
        where: { householdId },
        select: { id: true, name: true, parentId: true },
      }),
    ]);

    const rolled = rollupCategoryTotals(
      categories,
      grouped.flatMap((row) =>
        row.categoryId ? [{ categoryId: row.categoryId, total: Number(row._sum.amount ?? 0) }] : [],
      ),
    );

    return {
      month,
      income: moneyString(income._sum.amount ?? toDecimal(0)),
      expense: moneyString(expense._sum.amount ?? toDecimal(0)),
      balance: moneyString(balance._sum.balance ?? toDecimal(0)),
      scheduledCommitments: moneyString(scheduled._sum.amount ?? toDecimal(0)),
      expensesByCategory: formatRolled(rolled),
    };
  }
}

function formatRolled(nodes: RolledCategory[]): {
  categoryId: string;
  name: string;
  total: string;
  children: ReturnType<typeof formatRolled>;
}[] {
  return nodes.map((node) => ({
    categoryId: node.categoryId,
    name: node.name,
    total: moneyString(toDecimal(node.total)),
    children: formatRolled(node.children),
  }));
}
