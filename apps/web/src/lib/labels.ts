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

export type AccountType = keyof typeof accountTypeLabels;
export type TransactionType = keyof typeof transactionTypeLabels;
