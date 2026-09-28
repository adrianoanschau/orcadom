import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@orcadom/database';
import type { CreateBankAccountMappingDto, UpdateBankAccountMappingDto } from '@orcadom/types';
import { accessibleAccountWhere, assertAccountAccessible } from '../../common/account-access.js';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class BankAccountMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, householdMemberId: string) {
    const mappings = await this.prisma.client.bankAccountMapping.findMany({
      where: { householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
      include: { account: { select: { id: true, name: true } } },
      orderBy: [{ bankId: 'asc' }, { acctId: 'asc' }],
    });
    return mappings.map((mapping) => this.toResponse(mapping));
  }

  async create(householdId: string, householdMemberId: string, dto: CreateBankAccountMappingDto) {
    await this.assertAccount(householdId, householdMemberId, dto.accountId);
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

  async update(
    householdId: string,
    householdMemberId: string,
    id: string,
    dto: UpdateBankAccountMappingDto,
  ) {
    await this.findOwned(householdId, householdMemberId, id);
    await this.assertAccount(householdId, householdMemberId, dto.accountId);
    const mapping = await this.prisma.client.bankAccountMapping.update({
      where: { id },
      data: { accountId: dto.accountId },
      include: { account: { select: { id: true, name: true } } },
    });
    return this.toResponse(mapping);
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    await this.findOwned(householdId, householdMemberId, id);
    await this.prisma.client.bankAccountMapping.delete({ where: { id } });
  }

  private async findOwned(householdId: string, householdMemberId: string, id: string) {
    const mapping = await this.prisma.client.bankAccountMapping.findFirst({
      where: { id, householdId, account: accessibleAccountWhere(householdId, householdMemberId) },
    });
    if (!mapping) {
      throw new NotFoundException('Mapeamento não encontrado.');
    }
    return mapping;
  }

  private async assertAccount(
    householdId: string,
    householdMemberId: string,
    accountId: string,
  ): Promise<void> {
    await assertAccountAccessible(this.prisma.client, householdId, householdMemberId, accountId);
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
