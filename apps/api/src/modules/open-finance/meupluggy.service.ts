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
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@orcadom/database';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  type ProviderAccount,
} from '@orcadom/open-finance-core';
import {
  MEUPLUGGY_PROVIDER_ID,
  MEUPLUGGY_WEBHOOK_HEADER,
  MeuPluggyProvider,
} from '@orcadom/open-finance-meupluggy';
import { captureJobItemError, runObservedJob } from '../../common/observability/run-observed-job.js';
import { PrismaService } from '../../common/prisma.service.js';
import {
  decryptSecret,
  encryptSecret,
  hashWebhookToken,
  secretsMatch,
} from './credentials-crypto.js';
import {
  consentWarning,
  meupluggySyncRange,
  meupluggyUnavailableMessage,
  withProviderBackoff,
} from './meupluggy-range.js';
import { PrismaOpenFinanceLedger } from './prisma-ledger.js';
import { syncLinkedAccounts } from './sync-linked-accounts.js';

export const MEUPLUGGY_ENCRYPTION_KEY = 'MEUPLUGGY_ENCRYPTION_KEY';
const DUMMY_WEBHOOK_HASH = hashWebhookToken('meupluggy-missing-webhook-token');

interface StoredCredential {
  id: string;
  userId: string;
  householdId: string;
  clientId: string;
  clientSecretCipher: string;
  itemIds: string[];
  consentExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastAuthReason: string | null;
  webhookTokenHash: string;
  webhookTokenCipher: string;
}

interface AccountMapping {
  externalId: string;
  accountId: string;
}

interface RemoteAccount {
  externalId: string;
  name: string;
  kind: ProviderAccount['kind'];
  number: string;
  itemId: string;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class MeuPluggyService {
  private readonly logger = new Logger(MeuPluggyService.name);

  constructor(
    @Inject(MEUPLUGGY_ENCRYPTION_KEY) private readonly key: Buffer,
    private readonly prisma: PrismaService,
    private readonly ledger: PrismaOpenFinanceLedger,
  ) {}

  async save(userId: string, householdId: string, input: { clientId: string; clientSecret: string; itemIds: string[] }) {
    const provider = this.provider(input.clientId, input.clientSecret, input.itemIds, 'validate');
    let earliest: Date | null = null;
    await this.guard(async () => {
      for (const itemId of input.itemIds) {
        const connection = await provider.getConnection(itemId);
        if (connection.consentExpiresAt && (!earliest || connection.consentExpiresAt < earliest)) {
          earliest = connection.consentExpiresAt;
        }
      }
    });
    const existing = await this.prisma.client.meuPluggyCredential.findUnique({ where: { userId } });
    const webhookToken = existing
      ? decryptSecret(existing.webhookTokenCipher, this.key)
      : randomBytes(32).toString('base64url');
    const data = {
      clientId: input.clientId,
      clientSecretCipher: encryptSecret(input.clientSecret, this.key),
      itemIds: input.itemIds,
      consentExpiresAt: earliest,
      lastAuthReason: null,
      webhookTokenHash: hashWebhookToken(webhookToken),
      webhookTokenCipher: encryptSecret(webhookToken, this.key),
      householdId,
    };
    try {
      if (existing) {
        await this.prisma.client.meuPluggyCredential.update({ where: { userId }, data });
      } else {
        await this.prisma.client.meuPluggyCredential.create({ data: { ...data, userId } });
      }
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException('Essas credenciais já estão em uso.');
      throw error;
    }
    this.logger.log(`saved meupluggy credentials for user ${userId}`);
    return {
      clientId: input.clientId,
      itemIds: input.itemIds,
      webhookPath: this.webhookPath(webhookToken),
    };
  }

  async status(userId: string, householdId: string) {
    const stored = await this.findOwned(userId);
    if (!stored) {
      return {
        configured: false,
        clientId: null,
        items: [],
        consentExpiresAt: null,
        lastSyncAt: null,
        consentWarning: null,
        webhookPath: null,
      };
    }
    const secret = decryptSecret(stored.clientSecretCipher, this.key);
    const provider = this.provider(stored.clientId, secret, stored.itemIds, decryptSecret(stored.webhookTokenCipher, this.key));
    const items = [];
    let earliest = stored.consentExpiresAt;
    let authReason = stored.lastAuthReason;
    for (const itemId of stored.itemIds) {
      try {
        const connection = await this.guard(() => provider.getConnection(itemId));
        if (connection.authReason === 'consent_expired') authReason = 'consent_expired';
        if (connection.consentExpiresAt && (!earliest || connection.consentExpiresAt < earliest)) {
          earliest = connection.consentExpiresAt;
        }
        const accounts = connection.authReason === 'consent_expired' ? [] : await this.guard(() => provider.listAccounts(itemId));
        const linked = await this.linkedIds(householdId, accounts.map((account) => account.externalId));
        items.push({
          id: connection.id,
          status: connection.status,
          institutionName: connection.institutionName,
          consentExpiresAt: connection.consentExpiresAt?.toISOString() ?? null,
          accounts: accounts.map((account) => ({
            externalId: account.externalId,
            name: account.name,
            kind: account.kind,
            number: account.number,
            linkedAccountId: linked.get(account.externalId) ?? null,
          })),
        });
      } catch (error) {
        if (error instanceof ProviderAuthError && error.reason === 'consent_expired') {
          authReason = 'consent_expired';
          items.push({
            id: itemId,
            status: 'LOGIN_ERROR',
            institutionName: 'Meu Pluggy',
            consentExpiresAt: earliest?.toISOString() ?? null,
            accounts: [],
          });
          continue;
        }
        throw error;
      }
    }
    if (authReason !== stored.lastAuthReason || earliest?.getTime() !== stored.consentExpiresAt?.getTime()) {
      await this.prisma.client.meuPluggyCredential.update({
        where: { id: stored.id },
        data: { lastAuthReason: authReason, consentExpiresAt: earliest },
      });
    }
    return {
      configured: true,
      clientId: stored.clientId,
      items,
      consentExpiresAt: earliest?.toISOString() ?? null,
      lastSyncAt: stored.lastSyncAt?.toISOString() ?? null,
      consentWarning: consentWarning(earliest, authReason),
      webhookPath: this.webhookPath(decryptSecret(stored.webhookTokenCipher, this.key)),
    };
  }

  async remove(userId: string): Promise<void> {
    const stored = await this.findOwned(userId);
    if (!stored) throw new NotFoundException('Credenciais não encontradas.');
    await this.prisma.client.meuPluggyCredential.delete({ where: { id: stored.id } });
    this.logger.log(`removed meupluggy credentials for user ${userId}`);
  }

  async sync(userId: string, householdId: string, mappings: readonly AccountMapping[] = []) {
    const stored = await this.findOwned(userId);
    if (!stored) throw new NotFoundException('Credenciais não encontradas.');
    await this.applyMappings(householdId, mappings);
    return this.guard(() => withProviderBackoff(() => this.importStored(stored, householdId)));
  }

  async acceptWebhook(userToken: string, rawBody: string): Promise<void> {
    const hash = hashWebhookToken(userToken);
    const stored = await this.prisma.client.meuPluggyCredential.findUnique({ where: { webhookTokenHash: hash } });
    const hashOk = secretsMatch(hash, stored?.webhookTokenHash ?? DUMMY_WEBHOOK_HASH);
    if (!stored || !hashOk) throw new UnauthorizedException('Assinatura inválida.');
    const webhookToken = decryptSecret(stored.webhookTokenCipher, this.key);
    if (!secretsMatch(userToken, webhookToken)) throw new UnauthorizedException('Assinatura inválida.');
    const secret = decryptSecret(stored.clientSecretCipher, this.key);
    const provider = this.provider(stored.clientId, secret, stored.itemIds, webhookToken);
    const event = provider.parseWebhook({ [MEUPLUGGY_WEBHOOK_HEADER]: userToken }, rawBody);
    if (!event) throw new UnauthorizedException('Assinatura inválida.');
    setImmediate(() => {
      void withProviderBackoff(() => this.importStored(stored, stored.householdId)).catch((error: unknown) => {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.error(`meupluggy webhook sync failed: ${name}`);
      });
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: 'America/Sao_Paulo' })
  dailySync(): Promise<void> {
    return runObservedJob('meupluggy_sync', 'SYSTEM', async () => {
      const rows = await this.prisma.client.meuPluggyCredential.findMany();
      for (const row of rows) {
        try {
          await withProviderBackoff(() => this.importStored(row, row.householdId));
        } catch (error) {
          captureJobItemError('meupluggy_sync', error, row.userId);
        }
      }
    });
  }

  private async importStored(stored: StoredCredential, householdId: string) {
    const member = await this.prisma.client.householdMember.findFirst({
      where: { userId: stored.userId, householdId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Domicílio não encontrado.');
    const secret = decryptSecret(stored.clientSecretCipher, this.key);
    const webhookToken = decryptSecret(stored.webhookTokenCipher, this.key);
    const provider = this.provider(stored.clientId, secret, stored.itemIds, webhookToken);
    const remote: RemoteAccount[] = [];
    let earliest = stored.consentExpiresAt;
    let authReason: string | null = null;
    for (const itemId of stored.itemIds) {
      try {
        const connection = await this.guard(() => provider.getConnection(itemId));
        if (connection.consentExpiresAt && (!earliest || connection.consentExpiresAt < earliest)) {
          earliest = connection.consentExpiresAt;
        }
        if (connection.authReason === 'consent_expired') {
          authReason = 'consent_expired';
          continue;
        }
        if (connection.status === 'LOGIN_ERROR') continue;
        const accounts = await this.guard(() => provider.listAccounts(itemId));
        for (const account of accounts) {
          remote.push({
            externalId: account.externalId,
            name: account.name,
            kind: account.kind,
            number: account.number,
            itemId,
          });
        }
      } catch (error) {
        if (error instanceof ProviderAuthError && error.reason === 'consent_expired') {
          authReason = 'consent_expired';
          continue;
        }
        throw error;
      }
    }
    const linked = await this.linkedIds(householdId, remote.map((account) => account.externalId));
    const links = remote.flatMap((account) => {
      const localAccountId = linked.get(account.externalId);
      if (!localAccountId) return [];
      return [{ externalId: account.externalId, localAccountId, kind: account.kind }];
    });
    await syncLinkedAccounts(provider, this.ledger, {
      householdId,
      userId: stored.userId,
      range: meupluggySyncRange(stored.lastSyncAt),
      links,
    });
    const lastSyncAt = new Date();
    await this.prisma.client.meuPluggyCredential.update({
      where: { id: stored.id },
      data: { lastSyncAt, consentExpiresAt: earliest, lastAuthReason: authReason, householdId },
    });
    this.logger.log(`synced meupluggy user ${stored.userId}`);
    return {
      lastSyncAt: lastSyncAt.toISOString(),
      consentWarning: consentWarning(earliest, authReason),
      unmapped: remote
        .filter((account) => !linked.has(account.externalId))
        .map((account) => ({
          externalId: account.externalId,
          name: account.name,
          kind: account.kind,
          number: account.number,
        })),
    };
  }

  private async applyMappings(householdId: string, mappings: readonly AccountMapping[]): Promise<void> {
    for (const mapping of mappings) {
      const target = await this.prisma.client.account.findFirst({
        where: { id: mapping.accountId, householdId },
      });
      if (!target) throw new NotFoundException('Conta não encontrada.');
      if (target.externalAccountId && target.externalAccountId !== mapping.externalId) {
        throw new ConflictException('A conta já está vinculada a outra conta externa.');
      }
      const existing = await this.prisma.client.account.findFirst({
        where: {
          householdId,
          externalProvider: MEUPLUGGY_PROVIDER_ID,
          externalAccountId: mapping.externalId,
        },
      });
      if (existing && existing.id !== target.id) {
        throw new ConflictException('A conta externa já está vinculada.');
      }
      await this.prisma.client.account.update({
        where: { id: target.id },
        data: { externalProvider: MEUPLUGGY_PROVIDER_ID, externalAccountId: mapping.externalId },
      });
    }
  }

  private async linkedIds(householdId: string, externalIds: string[]): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const rows = await this.prisma.client.account.findMany({
      where: {
        householdId,
        externalProvider: MEUPLUGGY_PROVIDER_ID,
        externalAccountId: { in: externalIds },
      },
      select: { id: true, externalAccountId: true },
    });
    return new Map(
      rows.flatMap((row) => (row.externalAccountId ? [[row.externalAccountId, row.id] as const] : [])),
    );
  }

  private provider(clientId: string, clientSecret: string, itemIds: readonly string[], webhookToken: string) {
    return new MeuPluggyProvider({ clientId, clientSecret, itemIds, webhookToken });
  }

  private async findOwned(userId: string): Promise<StoredCredential | null> {
    return this.prisma.client.meuPluggyCredential.findUnique({ where: { userId } });
  }

  private webhookPath(token: string): string {
    return `/open-finance/webhooks/meupluggy/${token}`;
  }

  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        if (error.reason === 'consent_expired') throw error;
        throw new UnauthorizedException('O Meu Pluggy recusou as credenciais.');
      }
      if (error instanceof ProviderRateLimitError) {
        throw new HttpException('O Meu Pluggy limitou as requisições.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      if (error instanceof ProviderUnavailableError) {
        throw new ServiceUnavailableException(meupluggyUnavailableMessage(error.message));
      }
      throw error;
    }
  }
}
