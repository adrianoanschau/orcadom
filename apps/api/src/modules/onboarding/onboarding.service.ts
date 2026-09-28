import { Injectable } from '@nestjs/common';
import type { OnboardingStatus } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';
import { assembleOnboardingStatus, getOnboardingSteps } from './onboarding-steps.js';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string, householdId: string, householdMemberId: string): Promise<OnboardingStatus> {
    const [steps, state, firstMember] = await Promise.all([
      getOnboardingSteps(this.prisma.client, householdId, householdMemberId),
      this.prisma.client.userOnboardingState.findUnique({ where: { userId } }),
      this.prisma.client.householdMember.findFirst({
        where: { householdId },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { userId: true },
      }),
    ]);

    return assembleOnboardingStatus({
      steps,
      dismissedAt: state?.dismissedAt,
      firstMemberUserId: firstMember?.userId,
      userId,
    });
  }

  async dismiss(userId: string, householdId: string, householdMemberId: string): Promise<OnboardingStatus> {
    await this.prisma.client.userOnboardingState.upsert({
      where: { userId },
      create: { userId, dismissedAt: new Date() },
      update: { dismissedAt: new Date() },
    });
    return this.status(userId, householdId, householdMemberId);
  }

  async resume(userId: string, householdId: string, householdMemberId: string): Promise<OnboardingStatus> {
    await this.prisma.client.userOnboardingState.upsert({
      where: { userId },
      create: { userId, dismissedAt: null },
      update: { dismissedAt: null },
    });
    return this.status(userId, householdId, householdMemberId);
  }
}
