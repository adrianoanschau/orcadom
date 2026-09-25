import { Injectable } from '@nestjs/common';
import { PostingStatus, TransactionType } from '@orcadom/database';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(householdId: string, month: string) {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1));
    const period = { gte: start, lt: end };

    const [income, expense, balance, grouped, scheduled] = await Promise.all([
      this.prisma.client.transaction.aggregate({
        where: { householdId, type: TransactionType.INCOME, date: period },
        _sum: { amount: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: { householdId, type: TransactionType.EXPENSE, date: period },
        _sum: { amount: true },
      }),
      this.prisma.client.account.aggregate({
        where: { householdId },
        _sum: { balance: true },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['categoryId'],
        where: { householdId, type: TransactionType.EXPENSE, date: period, categoryId: { not: null } },
        _sum: { amount: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: {
          householdId,
          type: TransactionType.EXPENSE,
          postingStatus: PostingStatus.SCHEDULED,
        },
        _sum: { amount: true },
      }),
    ]);

    const categoryIds = grouped.flatMap((row) => (row.categoryId ? [row.categoryId] : []));
    const categories = await this.prisma.client.category.findMany({
      where: { householdId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map((category) => [category.id, category.name]));

    return {
      month,
      income: moneyString(income._sum.amount ?? toDecimal(0)),
      expense: moneyString(expense._sum.amount ?? toDecimal(0)),
      balance: moneyString(balance._sum.balance ?? toDecimal(0)),
      scheduledCommitments: moneyString(scheduled._sum.amount ?? toDecimal(0)),
      expensesByCategory: grouped
        .map((row) => ({
          categoryId: row.categoryId,
          name: row.categoryId ? (names.get(row.categoryId) ?? '') : '',
          total: moneyString(row._sum.amount ?? toDecimal(0)),
        }))
        .sort((left, right) => Number(right.total) - Number(left.total)),
    };
  }
}
