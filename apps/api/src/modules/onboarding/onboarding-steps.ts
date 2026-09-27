import type { OnboardingStatus, OnboardingStepFlags } from '@orcadom/types';

export interface OnboardingCountClient {
  account: { count: (args: { where: { householdId: string } }) => Promise<number> };
  transaction: { count: (args: { where: { householdId: string } }) => Promise<number> };
  budget: { count: (args: { where: { householdId: string } }) => Promise<number> };
  savingsGoal: { count: (args: { where: { householdId: string } }) => Promise<number> };
  bankAccountMapping: { count: (args: { where: { householdId: string } }) => Promise<number> };
  emailImportLog: { count: (args: { where: { householdId: string } }) => Promise<number> };
  householdMember: { count: (args: { where: { householdId: string } }) => Promise<number> };
}

export async function getOnboardingSteps(
  client: OnboardingCountClient,
  householdId: string,
): Promise<OnboardingStepFlags> {
  const where = { householdId };
  const [accounts, transactions, budgets, savingsGoals, mappings, emailLogs, members] =
    await Promise.all([
      client.account.count({ where }),
      client.transaction.count({ where }),
      client.budget.count({ where }),
      client.savingsGoal.count({ where }),
      client.bankAccountMapping.count({ where }),
      client.emailImportLog.count({ where }),
      client.householdMember.count({ where }),
    ]);

  return {
    hasAccount: accounts > 0,
    hasTransaction: transactions > 0,
    hasBudget: budgets > 0,
    hasSavingsGoal: savingsGoals > 0,
    // Alias is created with the household, so "configured" means a mapping or a used inbox.
    hasImportAlias: mappings > 0 || emailLogs > 0,
    hasInvitedMember: members > 1,
  };
}

export function isViewerInvited(firstMemberUserId: string | null | undefined, userId: string): boolean {
  return Boolean(firstMemberUserId) && firstMemberUserId !== userId;
}

export function shouldShowWelcome(input: {
  hasOnboardingState: boolean;
  viewerIsInvited: boolean;
  steps: OnboardingStepFlags;
}): boolean {
  return (
    !input.hasOnboardingState &&
    !input.viewerIsInvited &&
    !input.steps.hasAccount &&
    !input.steps.hasTransaction
  );
}

export function assembleOnboardingStatus(input: {
  steps: OnboardingStepFlags;
  dismissedAt: Date | null | undefined;
  firstMemberUserId: string | null | undefined;
  userId: string;
  hasOnboardingState: boolean;
}): OnboardingStatus {
  const viewerIsInvited = isViewerInvited(input.firstMemberUserId, input.userId);
  return {
    dismissedAt: input.dismissedAt?.toISOString() ?? null,
    viewerIsInvited,
    showWelcome: shouldShowWelcome({
      hasOnboardingState: input.hasOnboardingState,
      viewerIsInvited,
      steps: input.steps,
    }),
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
  const flags: EssentialFlag[] = ['hasAccount', 'hasTransaction'];
  if (!viewerIsInvited) return flags;
  return flags.filter((flag) => !steps[flag]);
}

export function visibleDeepeningFlags(
  steps: OnboardingStepFlags,
  viewerIsInvited: boolean,
): DeepeningFlag[] {
  const flags: DeepeningFlag[] = ['hasBudget', 'hasSavingsGoal', 'hasImportAlias', 'hasInvitedMember'];
  if (!viewerIsInvited) return flags;
  return flags.filter((flag) => !steps[flag]);
}
