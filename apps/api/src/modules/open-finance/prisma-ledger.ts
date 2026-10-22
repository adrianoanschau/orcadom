import { Injectable, NotFoundException } from '@nestjs/common';
import { PostingStatus, Prisma } from '@orcadom/database';
import { noonUtcFromKey, utcDateKey } from '../../common/calendar.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import type {
  LedgerMatchQuery,
  LedgerTransaction,
  MovementInput,
  OpenFinanceLedger,
  TransferConversion,
} from './import-provider-transactions.js';

function amountNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

@Injectable()
export class PrismaOpenFinanceLedger implements OpenFinanceLedger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
  ) {}

  async hasExternal(providerId: string, externalId: string): Promise<boolean> {
    const key = await this.prisma.client.openFinanceExternalKey.findUnique({
      where: { provider_externalId: { provider: providerId, externalId } },
      select: { id: true },
    });
    if (key) return true;
    const row = await this.prisma.client.transaction.findFirst({
      where: { externalProvider: providerId, externalId },
      select: { id: true },
    });
    return Boolean(row);
  }

  async listForMatch(query: LedgerMatchQuery): Promise<LedgerTransaction[]> {
    const rows = await this.prisma.client.transaction.findMany({
      where: {
        householdId: query.householdId,
        postingStatus: PostingStatus.POSTED,
        date: {
          gte: noonUtcFromKey(query.from),
          lte: noonUtcFromKey(query.to),
        },
        OR: [
          { accountId: query.accountId },
          { fromAccountId: query.accountId },
          { toAccountId: query.accountId },
          {
            type: { in: ['INCOME', 'EXPENSE'] },
            accountId: { not: query.accountId },
          },
        ],
      },
      include: {
        openFinanceKeys: {
          where: { provider: query.providerId },
          select: { id: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      date: utcDateKey(row.date),
      amount: amountNumber(row.amount),
      type: row.type,
      description: row.description,
      accountId: row.accountId,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      externalProvider: row.externalProvider,
      boundToProvider: Boolean(row.externalProvider) || row.openFinanceKeys.length > 0,
    }));
  }

  async addMovement(input: MovementInput): Promise<void> {
    const { events } = await this.prisma.client.$transaction(async (tx) => {
      const writer = tx as Prisma.TransactionClient;
      const created = await this.transactions.createWithin(
        writer,
        input.householdId,
        input.userId,
        {
          description: input.description,
          amount: input.amount,
          type: input.direction === 'out' ? 'EXPENSE' : 'INCOME',
          date: `${input.date}T12:00:00.000Z`,
          accountId: input.accountId,
        },
        {
          source: 'IMPORTED',
          externalId: input.externalId,
          externalProvider: input.providerId,
        },
      );
      await writer.openFinanceExternalKey.create({
        data: {
          provider: input.providerId,
          externalId: input.externalId,
          transactionId: created.transaction.id,
        },
      });
      return created;
    });
    await this.transactions.flushEvents(events);
  }

  async convertToTransfer(input: TransferConversion): Promise<void> {
    const { events } = await this.prisma.client.$transaction(async (tx) => {
      const writer = tx as Prisma.TransactionClient;
      const current = await writer.transaction.findFirst({
        where: { id: input.transactionId, householdId: input.householdId },
      });
      if (!current) throw new NotFoundException('Lançamento não encontrado.');
      const existingKeys = await writer.openFinanceExternalKey.findMany({
        where: { transactionId: current.id },
      });
      const remembered = new Map<string, { provider: string; externalId: string }>();
      for (const key of existingKeys) {
        remembered.set(`${key.provider}:${key.externalId}`, { provider: key.provider, externalId: key.externalId });
      }
      if (current.externalProvider && current.externalId) {
        remembered.set(`${current.externalProvider}:${current.externalId}`, {
          provider: current.externalProvider,
          externalId: current.externalId,
        });
      }
      remembered.set(`${input.providerId}:${input.externalId}`, {
        provider: input.providerId,
        externalId: input.externalId,
      });
      const removed = await this.transactions.deleteWithin(writer, current);
      const created = await this.transactions.createWithin(
        writer,
        input.householdId,
        input.userId,
        {
          description: input.description,
          amount: input.amount,
          type: 'TRANSFER',
          date: `${input.date}T12:00:00.000Z`,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
        },
        {
          source: 'IMPORTED',
          externalId: current.externalId ?? input.externalId,
          externalProvider: current.externalProvider ?? input.providerId,
        },
      );
      await writer.openFinanceExternalKey.createMany({
        data: [...remembered.values()].map((key) => ({
          provider: key.provider,
          externalId: key.externalId,
          transactionId: created.transaction.id,
        })),
      });
      return { events: [...removed.events, ...created.events] };
    });
    await this.transactions.flushEvents(events);
  }

  async rememberExternal(providerId: string, externalId: string, transactionId: string): Promise<void> {
    await this.prisma.client.openFinanceExternalKey.create({
      data: { provider: providerId, externalId, transactionId },
    });
  }
}
