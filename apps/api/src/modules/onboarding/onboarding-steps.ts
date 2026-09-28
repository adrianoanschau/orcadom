import type { OnboardingStatus, OnboardingStepFlags } from '@orcadom/types';
import { accessibleAccountWhere } from '../../common/account-access.js';

export interface OnboardingCountClient {
  account: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  transaction: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  budget: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  savingsGoal: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  householdImportAlias: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  householdMember: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
}

export async function getOnboardingSteps(
  client: OnboardingCountClient,
  householdId: string,
  householdMemberId: string,
): Promise<OnboardingStepFlags> {
  const accountWhere = accessibleAccountWhere(householdId, householdMemberId);
  const [accounts, transactions, budgets, savingsGoals, aliases, members] = await Promise.all([
    client.account.count({ where: accountWhere }),
    client.transaction.count({
      where: {
        householdId,
        OR: [
          { account: accountWhere },
          { fromAccount: accountWhere },
          { toAccount: accountWhere },
        ],
      },
    }),
    client.budget.count({ where: { householdId } }),
    client.savingsGoal.count({
      where: { householdId, account: accountWhere },
    }),
    client.householdImportAlias.count({ where: { householdId } }),
    client.householdMember.count({ where: { householdId } }),
  ]);

  return {
    hasAccount: accounts > 0,
    hasTransaction: transactions > 0,
    hasBudget: budgets > 0,
    hasSavingsGoal: savingsGoals > 0,
    hasImportAlias: aliases > 0,
    hasInvitedMember: members > 1,
  };
}

export function isViewerInvited(firstMemberUserId: string | null | undefined, userId: string): boolean {
  return Boolean(firstMemberUserId) && firstMemberUserId !== userId;
}

export function shouldShowWelcome(input: {
  dismissedAt: Date | null | undefined;
  steps: OnboardingStepFlags;
}): boolean {
  return !input.dismissedAt && !input.steps.hasAccount && !input.steps.hasTransaction;
}

export function assembleOnboardingStatus(input: {
  steps: OnboardingStepFlags;
  dismissedAt: Date | null | undefined;
  firstMemberUserId: string | null | undefined;
  userId: string;
}): OnboardingStatus {
  const viewerIsInvited = isViewerInvited(input.firstMemberUserId, input.userId);
  return {
    dismissedAt: input.dismissedAt?.toISOString() ?? null,
    viewerIsInvited,
    showWelcome: shouldShowWelcome({ dismissedAt: input.dismissedAt, steps: input.steps }),
    steps: input.steps,
  };
}

export function essentialCompletedCount(steps: OnboardingStepFlags): number {
  return Number(steps.hasAccount) + Number(steps.hasTransaction);
}

type EssentialFlag = keyof Pick<OnboardingStepFlags, 'hasAccount' | 'hasTransaction'>;
type DeepeningFlag = keyof Pick<
  OnboardingStepFlags,
  'hasBudget' | 'hasSavingsGoal' | 'hasImportAlias' | 'hasInvitedMember'
>;

export function visibleEssentialFlags(
  steps: OnboardingStepFlags,
  viewerIsInvited: boolean,
): EssentialFlag[] {
  if (viewerIsInvited && steps.hasAccount && steps.hasTransaction) return [];
  return ['hasAccount', 'hasTransaction'];
}

export function visibleDeepeningFlags(): DeepeningFlag[] {
  return ['hasBudget', 'hasSavingsGoal', 'hasImportAlias', 'hasInvitedMember'];
}
