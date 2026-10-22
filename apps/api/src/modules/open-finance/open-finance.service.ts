import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenFinanceConnectionStatus, Prisma } from '@orcadom/database';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type OpenFinanceProvider,
  type ProviderAccount,
} from '@orcadom/open-finance-core';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma.service.js';
import { PrismaOpenFinanceLedger } from './prisma-ledger.js';
import { OPEN_FINANCE_PROVIDER } from './provider-factory.js';
import { syncLinkedAccounts, syncRange, type LinkedProviderAccount } from './sync-linked-accounts.js';

interface StoredConnection {
  id: string;
  provider: string;
  externalId: string;
  status: OpenFinanceConnectionStatus;
  institutionName: string;
  lastSyncAt: Date | null;
};

interface AccountMapping {
  externalId: string;
  accountId?: string;
}

const KIND_TO_ACCOUNT = {
  CHECKING: 'CHECKING',
  SAVINGS: 'CHECKING',
  CREDIT_CARD: 'CREDIT_CARD',
} as const;

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function accountLabel(account: ProviderAccount): string {
  return `${account.name} ${account.number}`.slice(0, 80);
}

@Injectable()
export class OpenFinanceService {
  private readonly logger = new Logger(OpenFinanceService.name);

  constructor(
    @Inject(OPEN_FINANCE_PROVIDER) private readonly provider: OpenFinanceProvider | null,
    private readonly prisma: PrismaService,
    private readonly ledger: PrismaOpenFinanceLedger,
  ) {}

  async createConnectToken(userId: string) {
    const provider = this.requireProvider();
    const token = await this.guard(() => provider.createConnectToken(userId));
    return { token: token.token, expiresAt: token.expiresAt.toISOString() };
  }

  async registerConnection(userId: string, householdId: string, externalId: string) {
    const provider = this.requireProvider();
    const remote = await this.guard(() => provider.getConnection(externalId));
    try {
      const connection = await this.prisma.client.openFinanceConnection.create({
        data: {
          userId,
          householdId,
          provider: provider.id,
          externalId: remote.id,
          status: remote.status,
          institutionName: remote.institutionName,
          lastSyncAt: remote.lastSyncAt,
        },
      });
      return this.toResponse(connection);
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException('Essa conexão já está registrada.');
      throw error;
    }
  }

  async listConnections(userId: string, householdId: string) {
    const connections = await this.prisma.client.openFinanceConnection.findMany({
      where: { userId, householdId },
      orderBy: { createdAt: 'asc' },
    });
    return connections.map((connection) => this.toResponse(connection));
  }

  async syncConnection(
    userId: string,
    householdId: string,
    connectionId: string,
    mappings: readonly AccountMapping[] = [],
  ) {
    const provider = this.requireProvider();
    const connection = await this.findOwned(userId, householdId, connectionId);
    await this.prisma.client.openFinanceConnection.update({
      where: { id: connection.id },
      data: { status: OpenFinanceConnectionStatus.UPDATING },
    });
    try {
      const remote = await this.guard(
        () => provider.getConnection(connection.externalId),
        connection.id,
      );
      const accounts = await this.guard(() => provider.listAccounts(connection.externalId), connection.id);
      const links = await this.resolveAccounts(householdId, provider.id, accounts, mappings);
      await syncLinkedAccounts(provider, this.ledger, {
        householdId,
        userId,
        range: syncRange(connection.lastSyncAt),
        links,
      });
      const updated = await this.prisma.client.openFinanceConnection.update({
        where: { id: connection.id },
        data: { status: remote.status, institutionName: remote.institutionName, lastSyncAt: new Date() },
      });
      this.logger.log(`synced connection ${connection.id}`);
      return this.toResponse(updated);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        await this.prisma.client.openFinanceConnection.update({
          where: { id: connection.id },
          data: { status: connection.status },
        });
      }
      throw error;
    }
  }

  async revokeConnection(userId: string, householdId: string, connectionId: string): Promise<void> {
    const provider = this.requireProvider();
    const connection = await this.findOwned(userId, householdId, connectionId);
    await this.guard(() => provider.revoke(connection.externalId), connection.id);
    await this.prisma.client.openFinanceConnection.delete({ where: { id: connection.id } });
    this.logger.log(`revoked connection ${connection.id}`);
  }

  acceptWebhook(providerName: string, headers: Record<string, string>, rawBody: string): void {
    const provider = this.requireProvider();
    if (providerName !== provider.id) throw new NotFoundException('Provedor desconhecido.');
    const event = provider.parseWebhook(headers, rawBody);
    if (!event) throw new UnauthorizedException('Assinatura inválida.');
    setImmediate(() => {
      void this.syncByExternalId(event.connectionId).catch((error: unknown) => {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.error(`open finance webhook sync failed: ${name}`);
      });
    });
  }

  private async syncByExternalId(externalId: string): Promise<void> {
    const provider = this.requireProvider();
    const connection = await this.prisma.client.openFinanceConnection.findUnique({
      where: { provider_externalId: { provider: provider.id, externalId } },
    });
    if (!connection || connection.status === OpenFinanceConnectionStatus.REVOKED) return;
    await this.syncConnection(connection.userId, connection.householdId, connection.id);
  }

  private async resolveAccounts(
    householdId: string,
    providerId: string,
    accounts: readonly ProviderAccount[],
    mappings: readonly AccountMapping[],
  ): Promise<LinkedProviderAccount[]> {
    const links: LinkedProviderAccount[] = [];
    for (const account of accounts) {
      const requested = mappings.find((mapping) => mapping.externalId === account.externalId);
      const existing = await this.prisma.client.account.findFirst({
        where: { householdId, externalProvider: providerId, externalAccountId: account.externalId },
      });
      if (requested?.accountId) {
        const target = await this.prisma.client.account.findFirst({
          where: { id: requested.accountId, householdId },
        });
        if (!target) throw new NotFoundException('Conta não encontrada.');
        if (target.externalAccountId && target.externalAccountId !== account.externalId) {
          throw new ConflictException('A conta já está vinculada a outra conta externa.');
        }
        if (existing && existing.id !== target.id) {
          throw new ConflictException('A conta externa já está vinculada.');
        }
        await this.prisma.client.account.update({
          where: { id: target.id },
          data: { externalProvider: providerId, externalAccountId: account.externalId },
        });
        links.push({ externalId: account.externalId, localAccountId: target.id, kind: account.kind });
        continue;
      }
      if (existing) {
        links.push({ externalId: account.externalId, localAccountId: existing.id, kind: account.kind });
        continue;
      }
      const created = await this.prisma.client.account.create({
        data: {
          householdId,
          name: accountLabel(account),
          type: KIND_TO_ACCOUNT[account.kind],
          balance: 0,
          externalProvider: providerId,
          externalAccountId: account.externalId,
        },
      });
      links.push({ externalId: account.externalId, localAccountId: created.id, kind: account.kind });
    }
    return links;
  }

  private async findOwned(userId: string, householdId: string, connectionId: string): Promise<StoredConnection> {
    const connection = await this.prisma.client.openFinanceConnection.findFirst({
      where: { id: connectionId, userId, householdId },
    });
    if (!connection) throw new NotFoundException('Conexão não encontrada.');
    return connection;
  }

  private requireProvider(): OpenFinanceProvider {
    if (!this.provider) throw new ServiceUnavailableException('Open Finance não está configurado.');
    return this.provider;
  }

  private async guard<T>(work: () => Promise<T>, connectionId?: string): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        if (connectionId) await this.mark(connectionId, OpenFinanceConnectionStatus.LOGIN_ERROR);
        throw new UnauthorizedException('O provedor recusou a conexão.');
      }
      if (error instanceof ProviderRateLimitError) {
        throw new HttpException('O provedor limitou as requisições.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      if (error instanceof ProviderUnavailableError) {
        throw new ServiceUnavailableException('O provedor está indisponível.');
      }
      throw error;
    }
  }

  private async mark(connectionId: string, status: OpenFinanceConnectionStatus): Promise<void> {
    await this.prisma.client.openFinanceConnection.update({
      where: { id: connectionId },
      data: { status },
    });
  }

  private toResponse(connection: StoredConnection) {
    return {
      id: connection.id,
      provider: connection.provider,
      externalId: connection.externalId,
      status: connection.status,
      institutionName: connection.institutionName,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    };
  }
}

export function webhookHeaders(headers: Request['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') result[key] = value;
    else if (Array.isArray(value)) {
      const first = value[0];
      if (first) result[key] = first;
    }
  }
  return result;
}
