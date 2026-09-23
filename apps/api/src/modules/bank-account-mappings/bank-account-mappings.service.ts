import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@orcadom/database';
import type { CreateBankAccountMappingDto, UpdateBankAccountMappingDto } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class BankAccountMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const mappings = await this.prisma.client.bankAccountMapping.findMany({
      where: { userId },
      include: { account: { select: { id: true, name: true } } },
      orderBy: [{ bankId: 'asc' }, { acctId: 'asc' }],
    });
    return mappings.map((mapping) => this.toResponse(mapping));
  }

  async create(userId: string, dto: CreateBankAccountMappingDto) {
    await this.assertAccount(userId, dto.accountId);
    try {
      const mapping = await this.prisma.client.bankAccountMapping.create({
        data: { userId, bankId: dto.bankId, acctId: dto.acctId, accountId: dto.accountId },
        include: { account: { select: { id: true, name: true } } },
      });
      return this.toResponse(mapping);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este banco e conta já estão mapeados.');
      }
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateBankAccountMappingDto) {
    await this.findOwned(userId, id);
    await this.assertAccount(userId, dto.accountId);
    const mapping = await this.prisma.client.bankAccountMapping.update({
      where: { id },
      data: { accountId: dto.accountId },
      include: { account: { select: { id: true, name: true } } },
    });
    return this.toResponse(mapping);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.client.bankAccountMapping.delete({ where: { id } });
  }

  private async findOwned(userId: string, id: string) {
    const mapping = await this.prisma.client.bankAccountMapping.findFirst({ where: { id, userId } });
    if (!mapping) {
      throw new NotFoundException('Mapeamento não encontrado.');
    }
    return mapping;
  }

  private async assertAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.client.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
  }

  private toResponse(mapping: {
    id: string;
    bankId: string;
    acctId: string;
    accountId: string;
    account: { id: string; name: string };
  }) {
    return {
      id: mapping.id,
      bankId: mapping.bankId,
      acctId: mapping.acctId,
      accountId: mapping.accountId,
      accountName: mapping.account.name,
    };
  }
}
