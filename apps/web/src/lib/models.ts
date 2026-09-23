import type { AccountType, TransactionType } from './labels';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: string;
  color: string | null;
}

export interface Category {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon: string | null;
  color: string | null;
}

export interface Transaction {
  id: string;
  description: string;
  amount: string;
  type: TransactionType;
  date: string;
  accountId: string | null;
  categoryId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
}

export interface TransactionPage {
  data: Transaction[];
  page: number;
  limit: number;
  total: number;
}

export interface DashboardSummary {
  month: string;
  income: string;
  expense: string;
  balance: string;
  expensesByCategory: { categoryId: string | null; name: string; total: string }[];
}
