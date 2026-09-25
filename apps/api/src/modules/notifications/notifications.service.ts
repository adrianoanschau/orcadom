import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, Prisma } from '@orcadom/database';
import type { ListNotificationsQuery } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';
import type { BudgetThresholdPayload } from '../budgets/budget-events.service.js';
import {
  budgetNotificationCopy,
  emailImportNotificationCopy,
  type EmailImportEventPayload,
  type NotificationKind,
  wantsEmail,
} from './notification-policy.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async notifyBudget(payload: BudgetThresholdPayload): Promise<void> {
    const category = await this.prisma.client.category.findFirst({
      where: { id: payload.categoryId, householdId: payload.householdId },
      select: { name: true },
    });
    const copy = budgetNotificationCopy(
      payload.status,
      category?.name ?? 'esta categoria',
      payload.month,
    );
    await this.fanOut(payload.householdId, {
      type: copy.type,
      title: copy.title,
      message: copy.message,
      metadata: { categoryId: payload.categoryId, month: payload.month },
    });
  }

  async notifyEmailImport(payload: EmailImportEventPayload, unmapped: boolean): Promise<void> {
    const copy = emailImportNotificationCopy(payload.fileName, unmapped);
    await this.fanOut(payload.householdId, {
      type: copy.type,
      title: copy.title,
      message: copy.message,
      metadata: { importBatchId: payload.importBatchId },
    });
  }

  private async fanOut(
    householdId: string,
    input: { type: NotificationKind; title: string; message: string; metadata: Record<string, string> },
  ): Promise<void> {
    const members = await this.prisma.client.householdMember.findMany({
      where: { householdId },
      select: { userId: true },
    });
    for (const member of members) {
      await this.persist({ ...input, userId: member.userId });
    }
  }

  async list(userId: string, query: ListNotificationsQuery) {
    const items = await this.prisma.client.notification.findMany({
      where: { userId, ...(query.unread ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return items.map((item) => this.toResponse(item));
  }

  async markRead(userId: string, id: string) {
    const existing = await this.prisma.client.notification.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    const item = await this.prisma.client.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return this.toResponse(item);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.client.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async persist(input: {
    userId: string;
    type: NotificationKind;
    title: string;
    message: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    const created = await this.prisma.client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
        channels: [NotificationChannel.IN_APP],
      },
    });

    if (!wantsEmail(input.type)) return;
    const sent = await this.sendEmailBestEffort({
      userId: input.userId,
      subject: input.title,
      body: input.message,
      type: input.type,
    });
    if (!sent) return;
    await this.prisma.client.notification.update({
      where: { id: created.id },
      data: { channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL] },
    });
  }

  private async sendEmailBestEffort(input: {
    userId: string;
    subject: string;
    body: string;
    type: NotificationKind;
  }): Promise<boolean> {
    const url = this.config.get<string>('NOTIFICATIONS_WEBHOOK_URL');
    const secret = this.config.get<string>('NOTIFICATIONS_WEBHOOK_SECRET');
    if (!url || !secret || secret.startsWith('troque_este')) {
      this.logger.warn(`Canal de email ignorado para ${input.type}: webhook não configurado.`);
      return false;
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user?.email) {
      this.logger.warn(`Canal de email ignorado para ${input.type}: usuário sem e-mail.`);
      return false;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-notification-secret': secret,
        },
        body: JSON.stringify({
          to: user.email,
          subject: input.subject,
          body: input.body,
          type: input.type,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`webhook respondeu ${String(response.status)}`);
      }
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'falha desconhecida';
      this.logger.warn(`Falha ao enviar email de ${input.type}: ${detail}`);
      return false;
    }
  }

  private toResponse(item: {
    id: string;
    type: string;
    title: string;
    message: string;
    metadata: Prisma.JsonValue;
    channels: string[];
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      metadata: item.metadata,
      channels: item.channels,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
