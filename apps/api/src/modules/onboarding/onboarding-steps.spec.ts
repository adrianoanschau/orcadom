import { describe, expect, it } from 'vitest';
import type { OnboardingStepFlags } from '@orcadom/types';
import {
  assembleOnboardingStatus,
  essentialCompletedCount,
  getOnboardingSteps,
  type OnboardingCountClient,
  visibleDeepeningFlags,
  visibleEssentialFlags,
} from './onboarding-steps.js';

const empty: OnboardingStepFlags = {
  hasAccount: false,
  hasTransaction: false,
  hasBudget: false,
  hasSavingsGoal: false,
  hasImportAlias: false,
  hasInvitedMember: false,
};

function mockClient(counts: Partial<Record<keyof OnboardingCountClient, number>>): OnboardingCountClient {
  const countOf = (key: keyof OnboardingCountClient) => () => Promise.resolve(counts[key] ?? 0);
  return {
    account: { count: countOf('account') },
    transaction: { count: countOf('transaction') },
    budget: { count: countOf('budget') },
    savingsGoal: { count: countOf('savingsGoal') },
    bankAccountMapping: { count: countOf('bankAccountMapping') },
    emailImportLog: { count: countOf('emailImportLog') },
    householdMember: { count: countOf('householdMember') },
  };
}

describe('getOnboardingSteps', () => {
  it('household novo deixa tudo pendente', async () => {
    await expect(getOnboardingSteps(mockClient({ householdMember: 1 }), 'hh-new')).resolves.toEqual(empty);
  });

  it('household com dados parciais marca só o que já existe', async () => {
    await expect(
      getOnboardingSteps(
        mockClient({
          account: 1,
          transaction: 3,
          householdMember: 1,
        }),
        'hh-partial',
      ),
    ).resolves.toEqual({
      ...empty,
      hasAccount: true,
      hasTransaction: true,
    });
  });

  it('household de membro convidado herda os essenciais já feitos por outra pessoa', async () => {
    const steps = await getOnboardingSteps(
      mockClient({
        account: 2,
        transaction: 10,
        budget: 1,
        householdMember: 2,
      }),
      'hh-shared',
    );

    expect(steps).toEqual({
      hasAccount: true,
      hasTransaction: true,
      hasBudget: true,
      hasSavingsGoal: false,
      hasImportAlias: false,
      hasInvitedMember: true,
    });
    expect(visibleEssentialFlags(steps, true)).toEqual([]);
    expect(visibleDeepeningFlags(steps, true)).toEqual(['hasSavingsGoal', 'hasImportAlias']);
  });

  it('alias de importação só conta depois de mapeamento ou email usado', async () => {
    await expect(
      getOnboardingSteps(mockClient({ householdMember: 1, emailImportLog: 1 }), 'hh-mail'),
    ).resolves.toMatchObject({ hasImportAlias: true });
    await expect(
      getOnboardingSteps(mockClient({ householdMember: 1, bankAccountMapping: 1 }), 'hh-map'),
    ).resolves.toMatchObject({ hasImportAlias: true });
  });
});

describe('assembleOnboardingStatus', () => {
  it('mostra o modal de boas-vindas só no primeiro acesso de quem criou o espaço vazio', () => {
    const creator = assembleOnboardingStatus({
      steps: empty,
      dismissedAt: null,
      firstMemberUserId: 'owner',
      userId: 'owner',
      hasOnboardingState: false,
    });
    expect(creator.showWelcome).toBe(true);
    expect(creator.viewerIsInvited).toBe(false);
    expect(essentialCompletedCount(creator.steps)).toBe(0);

    const invited = assembleOnboardingStatus({
      steps: { ...empty, hasAccount: true, hasTransaction: true },
      dismissedAt: null,
      firstMemberUserId: 'owner',
      userId: 'guest',
      hasOnboardingState: false,
    });
    expect(invited.showWelcome).toBe(false);
    expect(invited.viewerIsInvited).toBe(true);
    expect(visibleEssentialFlags(invited.steps, invited.viewerIsInvited)).toEqual([]);
  });

  it('respeita a dispensa por usuário', () => {
    const dismissed = assembleOnboardingStatus({
      steps: empty,
      dismissedAt: new Date('2026-09-27T12:00:00.000Z'),
      firstMemberUserId: 'owner',
      userId: 'owner',
      hasOnboardingState: true,
    });
    expect(dismissed.dismissedAt).toBe('2026-09-27T12:00:00.000Z');
    expect(dismissed.showWelcome).toBe(false);
  });
});
