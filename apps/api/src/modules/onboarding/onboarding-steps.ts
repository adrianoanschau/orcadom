import type { OnboardingStatus, OnboardingStepFlags } from '@orcadom/types';

export interface OnboardingCountClient {
  account: { count: (args: { where: { householdId: string } }) => Promise<number> };
  transaction: { count: (args: { where: { householdId: string } }) => Promise<number> };
  budget: { count: (args: { where: { householdId: string } }) => Promise<number> };
  savingsGoal: { count: (args: { where: { householdId: string } }) => Promise<number> };
  householdImportAlias: { count: (args: { where: { householdId: string } }) => Promise<number> };
  householdMember: { count: (args: { where: { householdId: string } }) => Promise<number> };
}

export async function getOnboardingSteps(
  client: OnboardingCountClient,
  householdId: string,
): Promise<OnboardingStepFlags> {
  const where = { householdId };
  const [accounts, transactions, budgets, savingsGoals, aliases, members] = await Promise.all([
    client.account.count({ where }),
    client.transaction.count({ where }),
    client.budget.count({ where }),
    client.savingsGoal.count({ where }),
    client.householdImportAlias.count({ where }),
    client.householdMember.count({ where }),
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
