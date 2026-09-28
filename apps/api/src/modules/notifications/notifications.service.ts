import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, Prisma } from '@orcadom/database';
import {
  notificationPath,
  type ListNotificationsQuery,
  type PushSubscriptionDto,
} from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';
import type { BudgetThresholdPayload } from '../budgets/budget-events.service.js';
import type { ReportReadyPayload } from '../reports/report-events.service.js';
import type { SavingsGoalCompletedPayload } from '../savings-goals/savings-goal-events.service.js';
import {
  budgetNotificationCopy,
  emailImportNotificationCopy,
  reportReadyCopy,
  savingsGoalCompletedCopy,
  type EmailImportEventPayload,
  type NotificationKind,
  wantsEmail,
  wantsWebPush,
} from './notification-policy.js';
import { configureWebPush, sendPushNotification } from './web-push.js';

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

  async notifySavingsGoal(payload: SavingsGoalCompletedPayload): Promise<void> {
    const copy = savingsGoalCompletedCopy(payload.name, payload.targetAmount);
    await this.fanOut(payload.householdId, {
      type: copy.type,
      title: copy.title,
      message: copy.message,
      metadata: { goalId: payload.goalId },
    });
  }

  async notifyReportReady(payload: ReportReadyPayload): Promise<void> {
    const copy = reportReadyCopy(payload.format);
    await this.persist({
      userId: payload.requestedByUserId,
      type: copy.type,
      title: copy.title,
      message: copy.message,
      metadata: { reportId: payload.reportId },
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
    input: {
      type: NotificationKind;
      title: string;
      message: string;
      metadata: Record<string, string>;
    },
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

  pushPublicKey() {
    return { publicKey: this.vapidPublicKey() };
  }

  async subscribePush(userId: string, input: PushSubscriptionDto) {
    const item = await this.prisma.client.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
    });
    return { id: item.id, endpoint: item.endpoint };
  }

  async unsubscribePush(userId: string, endpoint: string): Promise<void> {
    await this.prisma.client.pushSubscription.deleteMany({ where: { userId, endpoint } });
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

    const channels: NotificationChannel[] = [NotificationChannel.IN_APP];

    if (wantsEmail(input.type)) {
      const sent = await this.sendEmailBestEffort({
        userId: input.userId,
        subject: input.title,
        body: input.message,
        type: input.type,
      });
      if (sent) channels.push(NotificationChannel.EMAIL);
    }

    if (wantsWebPush(input.type)) {
      const sent = await this.sendWebPushBestEffort({
        userId: input.userId,
        title: input.title,
        body: input.message,
        type: input.type,
        metadata: input.metadata,
        tag: created.id,
      });
      if (sent) channels.push(NotificationChannel.WEB_PUSH);
    }

    if (channels.length > 1) {
      await this.prisma.client.notification.update({
        where: { id: created.id },
        data: { channels },
      });
    }
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

  private vapidPublicKey(): string | null {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey || publicKey.startsWith('troque_este')) return null;
    return publicKey;
  }

  private webPushConfigured(): boolean {
    const publicKey = this.vapidPublicKey();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    return Boolean(publicKey && privateKey && !privateKey.startsWith('troque_este'));
  }

  private async sendWebPushBestEffort(input: {
    userId: string;
    title: string;
    body: string;
    type: NotificationKind;
    metadata: Record<string, string>;
    tag: string;
  }): Promise<boolean> {
    if (!this.webPushConfigured()) {
      this.logger.warn(`Canal de web push ignorado para ${input.type}: VAPID não configurado.`);
      return false;
    }

    const publicKey = this.vapidPublicKey();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return false;
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:orcadom@localhost';
    configureWebPush(publicKey, privateKey, subject);

    const subscriptions = await this.prisma.client.pushSubscription.findMany({
      where: { userId: input.userId },
    });
    if (subscriptions.length === 0) return false;

    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      url: notificationPath(input.type, input.metadata),
      tag: input.tag,
    });

    let delivered = false;
    for (const subscription of subscriptions) {
      const result = await sendPushNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      if (result.ok) {
        delivered = true;
        continue;
      }
      if (result.gone) {
        await this.prisma.client.pushSubscription.delete({ where: { id: subscription.id } });
        continue;
      }
      this.logger.warn(
        `Falha ao enviar web push de ${input.type}: ${result.detail ?? 'falha desconhecida'}`,
      );
    }
    return delivered;
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
