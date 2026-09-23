import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAccountDto, UpdateAccountDto } from '@orcadom/types';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAccountDto) {
    const account = await this.prisma.client.account.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        balance: toDecimal(dto.balance ?? 0),
        color: dto.color,
      },
    });
    return this.toResponse(account);
  }

  async list(userId: string) {
    const accounts = await this.prisma.client.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => this.toResponse(account));
  }

  async get(userId: string, id: string) {
    return this.toResponse(await this.findOwned(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOwned(userId, id);
    const account = await this.prisma.client.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    return this.toResponse(account);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    const linked = await this.prisma.client.transaction.count({
      where: {
        userId,
        OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }],
      },
    });
    if (linked > 0) {
      throw new ConflictException('A conta possui lançamentos e não pode ser excluída.');
    }
    await this.prisma.client.account.delete({ where: { id } });
  }

  private async findOwned(userId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, userId } });
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
    return account;
  }

  private toResponse(account: {
    id: string;
    name: string;
    type: string;
    balance: { toFixed(digits: number): string };
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: moneyString(account.balance),
      color: account.color,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
