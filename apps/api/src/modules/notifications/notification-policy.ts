export const EMAIL_IMPORT_READY = 'email-import.ready';
export const EMAIL_IMPORT_UNMAPPED_ACCOUNT = 'email-import.unmapped-account';

export type NotificationKind =
  | 'BUDGET_WARNING'
  | 'BUDGET_EXCEEDED'
  | 'EMAIL_IMPORT_READY'
  | 'EMAIL_IMPORT_UNMAPPED_ACCOUNT'
  | 'SAVINGS_GOAL_COMPLETED';

export type NotificationChannelKind = 'IN_APP' | 'EMAIL';

export const NOTIFICATION_CHANNEL_POLICY: Record<NotificationKind, NotificationChannelKind[]> = {
  BUDGET_WARNING: ['IN_APP'],
  BUDGET_EXCEEDED: ['IN_APP', 'EMAIL'],
  EMAIL_IMPORT_READY: ['IN_APP'],
  EMAIL_IMPORT_UNMAPPED_ACCOUNT: ['IN_APP', 'EMAIL'],
  SAVINGS_GOAL_COMPLETED: ['IN_APP'],
};

export interface EmailImportEventPayload {
  householdId: string;
  importBatchId: string;
  fileName: string;
}

export function wantsEmail(type: NotificationKind): boolean {
  return NOTIFICATION_CHANNEL_POLICY[type].includes('EMAIL');
}

export function formatMonthLabel(month: string): string {
  const [yearText, monthText] = month.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

export function budgetNotificationCopy(
  status: 'warning' | 'exceeded',
  categoryName: string,
  month: string,
) {
  const period = formatMonthLabel(month);
  if (status === 'warning') {
    return {
      type: 'BUDGET_WARNING' as const,
      title: 'Orçamento perto do limite',
      message: `Você já usou 80% do orçamento de ${categoryName} em ${period}.`,
    };
  }
  return {
    type: 'BUDGET_EXCEEDED' as const,
    title: 'Orçamento estourado',
    message: `O gasto de ${categoryName} em ${period} passou do limite.`,
  };
}

export function savingsGoalCompletedCopy(name: string, targetAmount: string) {
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(targetAmount))
    .replace(/[\u00a0\u202f]/g, ' ');
  return {
    type: 'SAVINGS_GOAL_COMPLETED' as const,
    title: 'Meta de economia concluída',
    message: `A meta ${name} (${formatted}) foi atingida.`,
  };
}

export function emailImportNotificationCopy(fileName: string, unmapped: boolean) {
  if (unmapped) {
    return {
      type: 'EMAIL_IMPORT_UNMAPPED_ACCOUNT' as const,
      title: 'Extrato recebido — escolha a conta',
      message: `${fileName} chegou, mas ainda não há conta mapeada para este banco.`,
    };
  }
  return {
    type: 'EMAIL_IMPORT_READY' as const,
    title: 'Extrato recebido por email',
    message: `${fileName} está pronto para revisão.`,
  };
}
