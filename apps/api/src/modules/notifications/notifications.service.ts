import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyEmailImport(input: {
    userId: string;
    importBatchId: string;
    fileName: string;
    unmapped: boolean;
  }) {
    return this.prisma.client.notification.create({
      data: {
        userId: input.userId,
        importBatchId: input.importBatchId,
        type: input.unmapped ? 'EMAIL_IMPORT_UNMAPPED' : 'EMAIL_IMPORT_READY',
        title: input.unmapped ? 'Extrato recebido — escolha a conta' : 'Extrato recebido por email',
        body: input.unmapped
          ? `${input.fileName} chegou, mas ainda não há conta mapeada para este banco.`
          : `${input.fileName} está pronto para revisão.`,
      },
    });
  }

  async listUnread(userId: string) {
    const items = await this.prisma.client.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
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
      data: { readAt: new Date() },
    });
    return this.toResponse(item);
  }

  private toResponse(item: {
    id: string;
    type: string;
    title: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
    importBatchId: string | null;
  }) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      importBatchId: item.importBatchId,
    };
  }
}
