import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAccountDto, RestrictAccountDto, UpdateAccountDto } from '@orcadom/types';
import { accessibleAccountWhere, resolveRestrictMemberIds } from '../../common/account-access.js';
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

  async list(householdId: string, householdMemberId: string) {
    const accounts = await this.prisma.client.account.findMany({
      where: accessibleAccountWhere(householdId, householdMemberId),
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => this.toResponse(account));
  }

  async get(householdId: string, householdMemberId: string, id: string) {
    return this.toResponse(await this.findAccessible(householdId, householdMemberId, id));
  }

  async update(householdId: string, householdMemberId: string, id: string, dto: UpdateAccountDto) {
    await this.findAccessible(householdId, householdMemberId, id);
    const account = await this.prisma.client.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    return this.toResponse(account);
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    await this.findAccessible(householdId, householdMemberId, id);
    const linked = await this.prisma.client.transaction.count({
      where: {
        householdId,
        OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }],
      },
    });
    if (linked > 0) {
      throw new ConflictException('A conta possui lançamentos e não pode ser excluída.');
    }
    const goals = await this.prisma.client.savingsGoal.count({
      where: { householdId, accountId: id },
    });
    if (goals > 0) {
      throw new ConflictException('A conta está vinculada a uma meta de economia e não pode ser excluída.');
    }
    await this.prisma.client.account.delete({ where: { id } });
  }

  async restrict(
    householdId: string,
    householdMemberId: string,
    id: string,
    dto: RestrictAccountDto,
  ) {
    await this.findAccessible(householdId, householdMemberId, id);
    const unique = resolveRestrictMemberIds(dto.householdMemberIds, householdMemberId);
    const members = await this.prisma.client.householdMember.findMany({
      where: { householdId, id: { in: unique } },
      select: { id: true },
    });
    if (members.length !== unique.length) {
      throw new BadRequestException('Um dos membros não pertence a este espaço.');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.account.update({
        where: { id },
        data: { isRestricted: true },
      });
      await tx.accountAccess.deleteMany({ where: { accountId: id } });
      await tx.accountAccess.createMany({
        data: unique.map((memberId) => ({ accountId: id, householdMemberId: memberId })),
      });
    });

    return this.get(householdId, householdMemberId, id);
  }

  async unrestrict(householdId: string, householdMemberId: string, id: string) {
    await this.findAccessible(householdId, householdMemberId, id);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.account.update({
        where: { id },
        data: { isRestricted: false },
      });
      await tx.accountAccess.deleteMany({ where: { accountId: id } });
    });
    return this.get(householdId, householdMemberId, id);
  }

  async listAccess(householdId: string, householdMemberId: string, id: string) {
    const account = await this.findAccessible(householdId, householdMemberId, id);
    if (!account.isRestricted) {
      const members = await this.prisma.client.householdMember.findMany({
        where: { householdId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      return {
        isRestricted: false,
        members: members.map((member) => this.toAccessMember(member, account.createdAt)),
      };
    }

    const access = await this.prisma.client.accountAccess.findMany({
      where: { accountId: id },
      include: {
        householdMember: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { grantedAt: 'asc' },
    });
    return {
      isRestricted: true,
      members: access.map((row) => this.toAccessMember(row.householdMember, row.grantedAt)),
    };
  }

  private async findAccessible(householdId: string, householdMemberId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({
      where: { id, ...accessibleAccountWhere(householdId, householdMemberId) },
    });
    if (!account) {
      throw new NotFoundException('Conta não encontrada.');
    }
    return account;
  }

  private toAccessMember(
    member: {
      id: string;
      role: string;
      user: { id: string; name: string; email: string };
    },
    grantedAt: Date,
  ) {
    return {
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      grantedAt: grantedAt.toISOString(),
    };
  }

  private toResponse(account: {
    id: string;
    name: string;
    type: string;
    balance: { toFixed(digits: number): string };
    color: string | null;
    isRestricted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: moneyString(account.balance),
      color: account.color,
      isRestricted: account.isRestricted,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
