import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, TransactionType } from '@orcadom/database';
import type { CreateBudgetDto, UpdateBudgetDto } from '@orcadom/types';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { computeBudgetProgress, monthEndExclusive, monthStart } from './budget-progress.js';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateBudgetDto) {
    await this.assertExpenseCategory(householdId, dto.categoryId);
    const from = monthStart(currentYearMonth());
    return this.replaceActive(householdId, dto.categoryId, dto.amount, from);
  }

  async list(householdId: string, month: string) {
    const start = monthStart(month);
    const end = monthEndExclusive(month);
    const [budgets, spentRows] = await Promise.all([
      this.prisma.client.budget.findMany({
        where: {
          householdId,
          effectiveFrom: { lte: start },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
        },
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['categoryId'],
        where: {
          householdId,
          type: TransactionType.EXPENSE,
          categoryId: { not: null },
          date: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
    ]);

    const spentByCategory = new Map(
      spentRows.map((row) => [row.categoryId, Number(row._sum.amount ?? 0)]),
    );

    const items = budgets.map((budget) => {
      const limit = Number(budget.amount);
      const spent = spentByCategory.get(budget.categoryId) ?? 0;
      const progress = computeBudgetProgress(spent, limit);
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        categoryColor: budget.category.color,
        limit: moneyString(budget.amount),
        spent: moneyString(toDecimal(progress.spent)),
        ratio: progress.ratio,
        status: progress.status,
        effectiveFrom: budget.effectiveFrom.toISOString(),
        effectiveTo: budget.effectiveTo?.toISOString() ?? null,
      };
    });

    return {
      month,
      budgets: items.sort((left, right) => right.ratio - left.ratio),
    };
  }

  async update(householdId: string, id: string, dto: UpdateBudgetDto) {
    const current = await this.findOwned(householdId, id);
    const from = monthStart(currentYearMonth());
    return this.replaceActive(householdId, current.categoryId, dto.amount, from);
  }

  async remove(householdId: string, id: string): Promise<void> {
    const current = await this.findOwned(householdId, id);
    const from = monthStart(currentYearMonth());
    if (current.effectiveTo && current.effectiveTo <= from) {
      throw new BadRequestException('Este orçamento já foi encerrado.');
    }
    await this.prisma.client.budget.update({
      where: { id: current.id },
      data: { effectiveTo: from },
    });
  }

  async progressFor(householdId: string, categoryId: string, month: string) {
    const start = monthStart(month);
    const budget = await this.prisma.client.budget.findFirst({
      where: {
        householdId,
        categoryId,
        effectiveFrom: { lte: start },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
    });
    if (!budget) return null;

    const end = monthEndExclusive(month);
    const { _sum } = await this.prisma.client.transaction.aggregate({
      where: {
        householdId,
        categoryId,
        type: TransactionType.EXPENSE,
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });
    const spent = Number(_sum.amount ?? 0);
    const progress = computeBudgetProgress(spent, Number(budget.amount));
    return {
      categoryId,
      month,
      status: progress.status,
      ratio: progress.ratio,
    };
  }

  private async replaceActive(householdId: string, categoryId: string, amount: number, from: Date) {
    const active = await this.prisma.client.budget.findFirst({
      where: { householdId, categoryId, effectiveTo: null },
    });

    const created = await this.prisma.client.$transaction(async (tx) => {
      if (active) {
        if (moneyString(active.amount) === moneyString(toDecimal(amount))) {
          return active;
        }
        await tx.budget.update({
          where: { id: active.id },
          data: { effectiveTo: from },
        });
      }
      return tx.budget.create({
        data: {
          householdId,
          categoryId,
          amount: toDecimal(amount),
          effectiveFrom: from,
        },
      });
    });

    return this.toResponse(created);
  }

  private async assertExpenseCategory(householdId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.client.category.findFirst({
      where: { id: categoryId, householdId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (category.type !== CategoryType.EXPENSE) {
      throw new BadRequestException('Orçamento só pode ser definido para categorias de despesa.');
    }
  }

  private async findOwned(householdId: string, id: string) {
    const budget = await this.prisma.client.budget.findFirst({ where: { id, householdId } });
    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado.');
    }
    return budget;
  }

  private toResponse(budget: {
    id: string;
    categoryId: string;
    amount: { toFixed(digits: number): string };
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
  }) {
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      amount: moneyString(budget.amount),
      effectiveFrom: budget.effectiveFrom.toISOString(),
      effectiveTo: budget.effectiveTo?.toISOString() ?? null,
      createdAt: budget.createdAt.toISOString(),
    };
  }
}

function currentYearMonth(): string {
  const now = new Date();
  return `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
