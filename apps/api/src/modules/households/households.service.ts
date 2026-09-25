import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdRole, InviteStatus } from '@orcadom/database';
import type { CreateHouseholdDto, CreateHouseholdInviteDto, UpdateHouseholdDto } from '@orcadom/types';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import { generateImportToken } from '../imports/email-import.util.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, name: string) {
    return this.prisma.client.household.create({
      data: {
        name,
        members: { create: { userId, role: HouseholdRole.OWNER } },
        importAlias: { create: { token: generateImportToken() } },
      },
    });
  }

  async create(userId: string, dto: CreateHouseholdDto) {
    const household = await this.createForUser(userId, dto.name);
    return this.toHousehold(household);
  }

  async list(userId: string) {
    const memberships = await this.prisma.client.householdMember.findMany({
      where: { userId },
      include: { household: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((membership) => ({
      ...this.toHousehold(membership.household),
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
    }));
  }

  async rename(userId: string, householdId: string, dto: UpdateHouseholdDto) {
    await this.assertOwner(userId, householdId);
    const household = await this.prisma.client.household.update({
      where: { id: householdId },
      data: { name: dto.name },
    });
    return this.toHousehold(household);
  }

  async invite(userId: string, householdId: string, dto: CreateHouseholdInviteDto) {
    await this.assertOwner(userId, householdId);
    const email = dto.email.trim().toLowerCase();
    const existingMember = await this.prisma.client.householdMember.findFirst({
      where: { householdId, user: { email } },
    });
    if (existingMember) {
      throw new ConflictException('Esta pessoa já faz parte deste espaço.');
    }

    await this.prisma.client.householdInvite.updateMany({
      where: { householdId, email, status: InviteStatus.PENDING },
      data: { status: InviteStatus.REVOKED },
    });

    const invite = await this.prisma.client.householdInvite.create({
      data: {
        householdId,
        email,
        role: dto.role === 'OWNER' ? HouseholdRole.OWNER : HouseholdRole.MEMBER,
        token: randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId: userId,
      },
    });
    return this.toInvite(invite);
  }

  async acceptInvite(userId: string, token: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const invite = await this.prisma.client.householdInvite.findUnique({ where: { token } });
    if (!invite || invite.status === InviteStatus.REVOKED) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (invite.status === InviteStatus.ACCEPTED) {
      throw new ConflictException('Este convite já foi aceito.');
    }
    if (invite.status === InviteStatus.EXPIRED || invite.expiresAt.getTime() <= Date.now()) {
      if (invite.status === InviteStatus.PENDING) {
        await this.prisma.client.householdInvite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.EXPIRED },
        });
      }
      throw new GoneException('Este convite expirou.');
    }
    if (invite.email !== user.email.toLowerCase()) {
      throw new ForbiddenException('Este convite foi enviado para outro e-mail.');
    }

    const already = await this.prisma.client.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId: invite.householdId } },
    });
    if (already) {
      await this.prisma.client.householdInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED },
      });
      return this.toHousehold(
        await this.prisma.client.household.findUniqueOrThrow({ where: { id: invite.householdId } }),
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.householdMember.create({
        data: { userId, householdId: invite.householdId, role: invite.role },
      }),
      this.prisma.client.householdInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED },
      }),
    ]);

    return this.toHousehold(
      await this.prisma.client.household.findUniqueOrThrow({ where: { id: invite.householdId } }),
    );
  }

  async listMembers(userId: string, householdId: string) {
    await this.assertMember(userId, householdId);
    const members = await this.prisma.client.householdMember.findMany({
      where: { householdId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const invites = await this.prisma.client.householdInvite.findMany({
      where: { householdId, status: InviteStatus.PENDING, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      members: members.map((member) => ({
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
      invites: invites.map((invite) => this.toInvite(invite)),
    };
  }

  async removeMember(actorId: string, householdId: string, targetUserId: string): Promise<void> {
    const actor = await this.assertOwner(actorId, householdId);
    const target = await this.prisma.client.householdMember.findUnique({
      where: { userId_householdId: { userId: targetUserId, householdId } },
    });
    if (!target) {
      throw new NotFoundException('Membro não encontrado.');
    }

    if (target.role === HouseholdRole.OWNER) {
      const owners = await this.prisma.client.householdMember.count({
        where: { householdId, role: HouseholdRole.OWNER },
      });
      if (owners <= 1) {
        throw new BadRequestException('O último responsável não pode sair do espaço.');
      }
    }

    if (targetUserId === actor.userId && target.role === HouseholdRole.OWNER) {
      const owners = await this.prisma.client.householdMember.count({
        where: { householdId, role: HouseholdRole.OWNER },
      });
      if (owners <= 1) {
        throw new BadRequestException('O último responsável não pode sair do espaço.');
      }
    }

    await this.prisma.client.householdMember.delete({
      where: { userId_householdId: { userId: targetUserId, householdId } },
    });
  }

  private async assertMember(userId: string, householdId: string) {
    const membership = await this.prisma.client.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });
    if (!membership) throw new ForbiddenException();
    return membership;
  }

  private async assertOwner(userId: string, householdId: string) {
    const membership = await this.assertMember(userId, householdId);
    if (membership.role !== HouseholdRole.OWNER) {
      throw new ForbiddenException('Só o responsável pode gerenciar membros.');
    }
    return membership;
  }

  private toHousehold(household: { id: string; name: string; createdAt: Date }) {
    return {
      id: household.id,
      name: household.name,
      createdAt: household.createdAt.toISOString(),
    };
  }

  private toInvite(invite: {
    id: string;
    email: string;
    token: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: invite.id,
      email: invite.email,
      token: invite.token,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }
}
