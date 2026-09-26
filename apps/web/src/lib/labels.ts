export const accountTypeLabels = {
  WALLET: 'Carteira',
  CHECKING: 'Conta corrente',
  CREDIT_CARD: 'Cartão de crédito',
} as const;

export const transactionTypeLabels = {
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
  TRANSFER: 'Transferência',
} as const;

export const recurrenceFrequencyLabels = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
} as const;

export const savingsGoalStatusLabels = {
  ACTIVE: 'Ativa',
  COMPLETED: 'Concluída',
  ABANDONED: 'Abandonada',
} as const;

export type AccountType = keyof typeof accountTypeLabels;
export type TransactionType = keyof typeof transactionTypeLabels;
export type RecurrenceFrequency = keyof typeof recurrenceFrequencyLabels;
export type SavingsGoalStatusLabel = keyof typeof savingsGoalStatusLabels;
