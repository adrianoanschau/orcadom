import type { OnboardingStatus, OnboardingStepFlags } from './models';

export interface OnboardingItem {
  id: string;
  title: string;
  href: string;
  completed?: boolean;
}

const essentialCatalog: {
  id: string;
  flag: keyof Pick<OnboardingStepFlags, 'hasAccount' | 'hasTransaction'>;
  title: string;
  href: string;
}[] = [
  {
    id: 'account',
    flag: 'hasAccount',
    title: 'Criar a primeira conta financeira',
    href: '/accounts?new=1',
  },
  {
    id: 'transaction',
    flag: 'hasTransaction',
    title: 'Lançar a primeira transação',
    href: '/transactions?new=1',
  },
];

const deepeningCatalog: {
  id: string;
  flag: keyof Pick<
    OnboardingStepFlags,
    'hasBudget' | 'hasSavingsGoal' | 'hasImportAlias' | 'hasInvitedMember'
  >;
  title: string;
  href: string;
}[] = [
  { id: 'budget', flag: 'hasBudget', title: 'Definir o primeiro orçamento', href: '/budgets' },
  {
    id: 'savingsGoal',
    flag: 'hasSavingsGoal',
    title: 'Criar a primeira meta de economia',
    href: '/savings-goals?new=1',
  },
  {
    id: 'importAlias',
    flag: 'hasImportAlias',
    title: 'Configurar o alias de importação por email',
    href: '/settings/import-alias',
  },
  {
    id: 'invite',
    flag: 'hasInvitedMember',
    title: 'Convidar alguém para o espaço',
    href: '/settings/household',
  },
];

const orientationCatalog: OnboardingItem[] = [
  { id: 'explore', title: 'Explorar o painel', href: '/dashboard' },
  { id: 'activity', title: 'Ver o histórico de atividade do espaço', href: '/settings/activity' },
];

export function checklistFromStatus(status: OnboardingStatus): {
  essentials: OnboardingItem[];
  deepening: OnboardingItem[];
  orientation: OnboardingItem[];
} {
  const essentials = essentialCatalog
    .filter((item) => !status.viewerIsInvited || !status.steps[item.flag])
    .map((item) => ({
      id: item.id,
      title: item.title,
      href: item.href,
      completed: status.steps[item.flag],
    }));
  const deepening = deepeningCatalog
    .filter((item) => !status.viewerIsInvited || !status.steps[item.flag])
    .map((item) => ({
      id: item.id,
      title: item.title,
      href: item.href,
      completed: status.steps[item.flag],
    }));
  return {
    essentials,
    deepening,
    orientation: status.viewerIsInvited ? orientationCatalog : [],
  };
}

export function essentialProgress(items: OnboardingItem[]): { done: number; total: number } {
  return {
    done: items.filter((item) => item.completed).length,
    total: items.length,
  };
}
