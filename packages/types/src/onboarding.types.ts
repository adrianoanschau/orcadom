export const onboardingStepFlags = [
  'hasAccount',
  'hasTransaction',
  'hasBudget',
  'hasSavingsGoal',
  'hasImportAlias',
  'hasInvitedMember',
] as const;

export type OnboardingStepFlag = (typeof onboardingStepFlags)[number];

export interface OnboardingStepFlags {
  hasAccount: boolean;
  hasTransaction: boolean;
  hasBudget: boolean;
  hasSavingsGoal: boolean;
  hasImportAlias: boolean;
  hasInvitedMember: boolean;
}

export interface OnboardingStatus {
  dismissedAt: string | null;
  viewerIsInvited: boolean;
  showWelcome: boolean;
  steps: OnboardingStepFlags;
}
