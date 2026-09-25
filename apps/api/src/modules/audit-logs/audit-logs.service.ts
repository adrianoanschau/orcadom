import { Injectable } from '@nestjs/common';
import { formatAuditChanges, formatAuditHeadline, Prisma } from '@orcadom/database';
import type { ListAuditLogsQuery } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, query: ListAuditLogsQuery) {
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
        changes: formatAuditChanges(
          item.action,
          before,
          after,
          asRecord(item.metadata),
        ),
        createdAt: item.createdAt.toISOString(),
      };
    });
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}
