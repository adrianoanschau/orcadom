import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@orcadom/database';
import type { CreateBankAccountMappingDto, UpdateBankAccountMappingDto } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class BankAccountMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string) {
    const mappings = await this.prisma.client.bankAccountMapping.findMany({
      where: { householdId },
      include: { account: { select: { id: true, name: true } } },
      orderBy: [{ bankId: 'asc' }, { acctId: 'asc' }],
    });
    return mappings.map((mapping) => this.toResponse(mapping));
  }

  async create(householdId: string, dto: CreateBankAccountMappingDto) {
    await this.assertAccount(householdId, dto.accountId);
    try {
      const mapping = await this.prisma.client.bankAccountMapping.create({
        data: { householdId, bankId: dto.bankId, acctId: dto.acctId, accountId: dto.accountId },
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

  async update(householdId: string, id: string, dto: UpdateBankAccountMappingDto) {
    await this.findOwned(householdId, id);
    await this.assertAccount(householdId, dto.accountId);
    const mapping = await this.prisma.client.bankAccountMapping.update({
      where: { id },
      data: { accountId: dto.accountId },
      include: { account: { select: { id: true, name: true } } },
    });
    return this.toResponse(mapping);
  }

  async remove(householdId: string, id: string): Promise<void> {
    await this.findOwned(householdId, id);
    await this.prisma.client.bankAccountMapping.delete({ where: { id } });
  }

  private async findOwned(householdId: string, id: string) {
    const mapping = await this.prisma.client.bankAccountMapping.findFirst({ where: { id, householdId } });
    if (!mapping) {
      throw new NotFoundException('Mapeamento não encontrado.');
    }
    return mapping;
  }

  private async assertAccount(householdId: string, accountId: string): Promise<void> {
    const account = await this.prisma.client.account.findFirst({
      where: { id: accountId, householdId },
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
