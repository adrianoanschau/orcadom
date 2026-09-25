import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_HOUSEHOLD_KEY } from '../decorators/skip-household.decorator.js';
import type { RequestHousehold } from '../decorators/current-household.decorator.js';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ||
      this.reflector.getAllAndOverride<boolean>(SKIP_HOUSEHOLD_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId: string };
      headers: Record<string, string | string[] | undefined>;
      household?: RequestHousehold;
    }>();
    const raw = request.headers['x-household-id'];
    const householdId = Array.isArray(raw) ? raw[0] : raw;
    if (!householdId) {
      throw new BadRequestException('X-Household-Id ausente');
    }

    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }

    const membership = await this.prisma.client.householdMember.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });
    if (!membership) {
      throw new ForbiddenException();
    }

    request.household = { id: householdId, role: membership.role };
    return true;
  }
}
