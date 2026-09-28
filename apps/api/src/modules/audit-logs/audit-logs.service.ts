import { Injectable } from '@nestjs/common';
import { formatAuditChanges, formatAuditHeadline, Prisma } from '@orcadom/database';
import type { ListAuditLogsQuery } from '@orcadom/types';
import {
  getAccessibleAccountIds,
  transactionTouchesAccessibleAccounts,
} from '../../common/account-access.js';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, householdMemberId: string, query: ListAuditLogsQuery) {
    const accessibleIds = await getAccessibleAccountIds(
      this.prisma.client,
      householdId,
      householdMemberId,
    );
    const hiddenFilter = await this.hiddenEntityFilter(householdId, accessibleIds);

    const items = await this.prisma.client.auditLog.findMany({
      where: {
        householdId,
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...hiddenFilter,
      },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return items.map((item) => {
      const before = asRecord(item.before);
      const after = asRecord(item.after);
      return {
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        source: item.source,
        actorName: item.actorUser?.name ?? null,
        headline: formatAuditHeadline({
          action: item.action,
          source: item.source,
          actorName: item.actorUser?.name ?? null,
        }),
        changes: formatAuditChanges(item.action, before, after, asRecord(item.metadata)),
        createdAt: item.createdAt.toISOString(),
      };
    });
  }

  private async hiddenEntityFilter(householdId: string, accessibleIds: string[]) {
    const hiddenAccounts = await this.prisma.client.account.findMany({
      where: { householdId, id: { notIn: accessibleIds } },
      select: { id: true },
    });
    if (hiddenAccounts.length === 0) return {};

    const hidden = hiddenAccounts.map((row) => row.id);
    const [transactions, plans, recurrences, goals, batches] = await Promise.all([
      this.prisma.client.transaction.findMany({
        where: { householdId, NOT: transactionTouchesAccessibleAccounts(accessibleIds) },
        select: { id: true },
      }),
      this.prisma.client.installmentPlan.findMany({
        where: { householdId, accountId: { in: hidden } },
        select: { id: true },
      }),
      this.prisma.client.recurringTransaction.findMany({
        where: { householdId, accountId: { in: hidden } },
        select: { id: true },
      }),
      this.prisma.client.savingsGoal.findMany({
        where: { householdId, accountId: { in: hidden } },
        select: { id: true },
      }),
      this.prisma.client.importBatch.findMany({
        where: { householdId, accountId: { in: hidden } },
        select: { id: true },
      }),
    ]);

    const exclusions = [
      { entityType: 'Account', entityId: { in: hidden } },
      { entityType: 'Transaction', entityId: { in: transactions.map((row) => row.id) } },
      { entityType: 'InstallmentPlan', entityId: { in: plans.map((row) => row.id) } },
      { entityType: 'RecurringTransaction', entityId: { in: recurrences.map((row) => row.id) } },
      { entityType: 'SavingsGoal', entityId: { in: goals.map((row) => row.id) } },
      { entityType: 'ImportBatch', entityId: { in: batches.map((row) => row.id) } },
    ].filter((clause) => Array.isArray(clause.entityId.in) && clause.entityId.in.length > 0);

    if (exclusions.length === 0) return {};
    return { NOT: { OR: exclusions } };
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}
