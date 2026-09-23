import { Injectable } from '@nestjs/common';
import { EmailImportStatus, ImportSource, ImportStatus } from '@orcadom/database';
import type { EmailImportDto, EmailImportLogsQuery } from '@orcadom/types';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import { extractImportToken } from '../imports/email-import.util.js';
import { ImportsService } from '../imports/imports.service.js';
import { decodeStatementText } from '../imports/parsers/shared.js';
import { extractOfxAccount, parseOfx } from '../imports/parsers/ofx.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportsService,
    private readonly notifications: NotificationsService,
  ) {}

  async ingestEmail(dto: EmailImportDto) {
    const attachment = decodeAttachment(dto.attachment);
    const attachmentHash = createHash('sha256').update(attachment).digest('hex');
    const recipientAddress = dto.recipientAddress;
    const token = extractImportToken(dto.token) ?? extractImportToken(recipientAddress) ?? dto.token.trim().toLowerCase();

    const duplicate = await this.prisma.client.emailImportLog.findUnique({
      where: { messageId_attachmentHash: { messageId: dto.messageId, attachmentHash } },
    });
    if (duplicate) {
      return this.toResponse(duplicate.status, duplicate.importBatchId, 'Anexo já processado.');
    }

    if (attachment.length === 0 || attachment.length > MAX_ATTACHMENT_BYTES) {
      return this.recordLog({
        messageId: dto.messageId,
        attachmentHash,
        recipientAddress,
        status: EmailImportStatus.ERROR,
        errorMessage: 'Anexo vazio ou maior que 2 MB.',
      });
    }

    const alias = await this.prisma.client.userImportAlias.findUnique({ where: { token } });
    if (!alias) {
      return this.recordLog({
        messageId: dto.messageId,
        attachmentHash,
        recipientAddress,
        status: EmailImportStatus.UNRECOGNIZED_TOKEN,
        errorMessage: `Token não reconhecido: ${token}`,
      });
    }

    const text = decodeStatementText(attachment);
    let rows;
    try {
      rows = parseOfx(text);
    } catch (error) {
      return this.recordLog({
        messageId: dto.messageId,
        attachmentHash,
        recipientAddress,
        userId: alias.userId,
        status: EmailImportStatus.ERROR,
        errorMessage: error instanceof Error ? error.message : 'Falha ao ler o OFX.',
      });
    }

    if (rows.length === 0) {
      return this.recordLog({
        messageId: dto.messageId,
        attachmentHash,
        recipientAddress,
        userId: alias.userId,
        status: EmailImportStatus.ERROR,
        errorMessage: 'Nenhum lançamento encontrado no OFX.',
      });
    }

    const identity = extractOfxAccount(text);
    const mapping =
      identity.bankId && identity.acctId
        ? await this.prisma.client.bankAccountMapping.findUnique({
            where: {
              userId_bankId_acctId: {
                userId: alias.userId,
                bankId: identity.bankId,
                acctId: identity.acctId,
              },
            },
          })
        : null;

    const unmapped = !mapping;
    const preview = await this.imports.createPendingBatch({
      userId: alias.userId,
      accountId: mapping?.accountId ?? null,
      fileName: dto.fileName ?? 'extrato.ofx',
      format: 'OFX',
      source: ImportSource.EMAIL,
      status: unmapped ? ImportStatus.UNMAPPED_ACCOUNT : ImportStatus.PENDING,
      bankId: identity.bankId,
      acctId: identity.acctId,
      rows,
    });

    const log = await this.prisma.client.emailImportLog.create({
      data: {
        messageId: dto.messageId,
        attachmentHash,
        recipientAddress,
        userId: alias.userId,
        importBatchId: preview.id,
        status: unmapped ? EmailImportStatus.UNMAPPED_ACCOUNT : EmailImportStatus.PROCESSED,
      },
    });

    await this.notifications.notifyEmailImport({
      userId: alias.userId,
      importBatchId: preview.id,
      fileName: preview.fileName,
      unmapped,
    });

    return this.toResponse(log.status, preview.id);
  }

  async listLogs(query: EmailImportLogsQuery) {
    const logs = await this.prisma.client.emailImportLog.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  private async recordLog(data: {
    messageId: string;
    attachmentHash: string;
    recipientAddress: string;
    status: EmailImportStatus;
    userId?: string;
    importBatchId?: string;
    errorMessage?: string;
  }) {
    const log = await this.prisma.client.emailImportLog.create({ data });
    return this.toResponse(log.status, log.importBatchId, data.errorMessage);
  }

  private toResponse(status: EmailImportStatus, importBatchId: string | null, message?: string) {
    return { status, importBatchId, message: message ?? null };
  }
}

function decodeAttachment(raw: string): Buffer {
  const payload = raw.includes(',') ? (raw.split(',').pop() ?? raw) : raw;
  return Buffer.from(payload.replace(/\s/g, ''), 'base64');
}
