import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import { buildImportAddress, defaultMailbox, generateImportToken } from '../imports/email-import.util.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getImportAlias(userId: string) {
    const alias = await this.ensureAlias(userId);
    const address = buildImportAddress(alias.token, defaultMailbox());
    return {
      token: alias.token,
      address,
      mailbox: defaultMailbox(),
      createdAt: alias.createdAt.toISOString(),
    };
  }

  async listEmailImportLogs(userId: string) {
    const logs = await this.prisma.client.emailImportLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return logs.map((log) => ({
      id: log.id,
      messageId: log.messageId,
      recipientAddress: log.recipientAddress,
      status: log.status,
      errorMessage: log.errorMessage,
      importBatchId: log.importBatchId,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async ensureAlias(userId: string) {
    const existing = await this.prisma.client.userImportAlias.findUnique({ where: { userId } });
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = generateImportToken();
      try {
        return await this.prisma.client.userImportAlias.create({ data: { userId, token } });
      } catch {
        // token collision; retry
      }
    }

    return this.prisma.client.userImportAlias.create({
      data: { userId, token: `${generateImportToken()}${generateImportToken()}`.slice(0, 8) },
    });
  }
}
