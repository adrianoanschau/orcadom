import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAccountDto, UpdateAccountDto } from '@orcadom/types';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateAccountDto) {
    const account = await this.prisma.client.account.create({
      data: {
        householdId,
        name: dto.name,
        type: dto.type,
        balance: toDecimal(dto.balance ?? 0),
        color: dto.color,
      },
    });
    return this.toResponse(account);
  }

  async list(householdId: string) {
    const accounts = await this.prisma.client.account.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => this.toResponse(account));
  }

  async get(householdId: string, id: string) {
    return this.toResponse(await this.findOwned(householdId, id));
  }

  async update(householdId: string, id: string, dto: UpdateAccountDto) {
    await this.findOwned(householdId, id);
    const account = await this.prisma.client.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    return this.toResponse(account);
  }

  async remove(householdId: string, id: string): Promise<void> {
    await this.findOwned(householdId, id);
    const linked = await this.prisma.client.transaction.count({
      where: {
        householdId,
        OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }],
      },
    });
    if (linked > 0) {
      throw new ConflictException('A conta possui lançamentos e não pode ser excluída.');
    }
    await this.prisma.client.account.delete({ where: { id } });
  }

  private async findOwned(householdId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, householdId } });
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
