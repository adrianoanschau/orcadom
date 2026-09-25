import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, PostingStatus, TransactionType } from '@orcadom/database';
import type { CreateInstallmentPlanDto } from '@orcadom/types';
import { applyBalance } from '../../common/balance.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BudgetEventsService } from '../budgets/budget-events.service.js';
import { generateInstallments, isDueOnOrBefore } from './generate-installments.js';

@Injectable()
export class InstallmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetEvents: BudgetEventsService,
  ) {}

  async create(userId: string, dto: CreateInstallmentPlanDto) {
    await this.assertAccount(userId, dto.accountId);
    await this.assertExpenseCategory(userId, dto.categoryId);
    const purchaseDate = new Date(dto.purchaseDate);
    const generated = generateInstallments({
      totalAmount: dto.totalAmount,
      installmentsCount: dto.installmentsCount,
      purchaseDate,
    });
    const first = generated[0];
    if (!first) {
      throw new BadRequestException('Informe pelo menos duas parcelas.');
    }
    const previous = await this.budgetEvents.snapshot(userId, dto.categoryId, first.date);

    const plan = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.installmentPlan.create({
        data: {
          userId,
          description: dto.description,
          totalAmount: toDecimal(dto.totalAmount),
          installmentsCount: dto.installmentsCount,
          purchaseDate,
          accountId: dto.accountId,
          categoryId: dto.categoryId,
        },
      });

      for (const row of generated) {
        const posted = isDueOnOrBefore(row.date);
        const transaction = await tx.transaction.create({
          data: {
            userId,
            description: `${dto.description} (${String(row.installmentNumber)}/${String(dto.installmentsCount)})`,
            amount: row.amount,
            type: TransactionType.EXPENSE,
            date: row.date,
            accountId: dto.accountId,
            categoryId: dto.categoryId,
            postingStatus: posted ? PostingStatus.POSTED : PostingStatus.SCHEDULED,
            installmentPlanId: created.id,
            installmentNumber: row.installmentNumber,
          },
        });
        if (posted) {
          await applyBalance(tx, transaction, 1);
        }
      }
      return created;
    });

    await this.budgetEvents.emitIfCrossed(userId, dto.categoryId, first.date, previous?.status);
    return this.get(userId, plan.id);
  }

  async list(userId: string) {
    const plans = await this.prisma.client.installmentPlan.findMany({
      where: { userId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        installments: { select: { amount: true, postingStatus: true } },
      },
      orderBy: { purchaseDate: 'desc' },
    });
    return plans.map((plan) => this.toSummary(plan));
  }

  async get(userId: string, id: string) {
    const plan = await this.prisma.client.installmentPlan.findFirst({
      where: { id, userId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!plan) {
      throw new NotFoundException('Plano de parcelamento não encontrado.');
    }
    return {
      ...this.toSummary(plan),
      installments: plan.installments.map((item) => ({
        id: item.id,
        description: item.description,
        amount: moneyString(item.amount),
        date: item.date.toISOString(),
        postingStatus: item.postingStatus,
        installmentNumber: item.installmentNumber,
      })),
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const plan = await this.prisma.client.installmentPlan.findFirst({
      where: { id, userId },
      include: { installments: { select: { id: true, postingStatus: true } } },
    });
    if (!plan) {
      throw new NotFoundException('Plano de parcelamento não encontrado.');
    }
    const scheduledIds = plan.installments
      .filter((item) => item.postingStatus === PostingStatus.SCHEDULED)
      .map((item) => item.id);
    const postedCount = plan.installments.length - scheduledIds.length;

    await this.prisma.client.$transaction(async (tx) => {
      if (scheduledIds.length > 0) {
        await tx.transaction.deleteMany({ where: { id: { in: scheduledIds } } });
      }
      if (postedCount === 0) {
        await tx.installmentPlan.delete({ where: { id: plan.id } });
      }
    });
  }

  private toSummary(plan: {
    id: string;
    description: string;
    totalAmount: { toFixed(digits: number): string };
    installmentsCount: number;
    purchaseDate: Date;
    accountId: string;
    categoryId: string | null;
    account: { name: string };
    category: { name: string } | null;
    installments: { amount: { toFixed(digits: number): string }; postingStatus: PostingStatus }[];
  }) {
    const posted = plan.installments.filter((item) => item.postingStatus === PostingStatus.POSTED);
    const scheduled = plan.installments.filter((item) => item.postingStatus === PostingStatus.SCHEDULED);
    const remaining = scheduled.reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      id: plan.id,
      description: plan.description,
      totalAmount: moneyString(plan.totalAmount),
      installmentsCount: plan.installmentsCount,
      purchaseDate: plan.purchaseDate.toISOString(),
      accountId: plan.accountId,
      accountName: plan.account.name,
      categoryId: plan.categoryId,
      categoryName: plan.category?.name ?? null,
      postedCount: posted.length,
      scheduledCount: scheduled.length,
      remainingAmount: remaining.toFixed(2),
    };
  }

  private async assertAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.client.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
  }

  private async assertExpenseCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.client.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (category.type !== CategoryType.EXPENSE) {
      throw new BadRequestException('Parcelamento só pode usar categoria de despesa.');
    }
  }
}
