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
  source?: 'MANUAL' | 'IMPORTED';
  externalId?: string | null;
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

export interface ImportPreviewRow {
  lineId: string;
  externalId: string;
  date: string;
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  suggestedCategoryId: string | null;
  confidence: 'high' | 'low' | null;
  suggestionSource: 'memory' | 'similarity' | null;
  isDuplicate: boolean;
}

export interface ImportPreview {
  id: string;
  fileName: string;
  format: 'OFX' | 'CSV';
  status: 'PENDING' | 'CONFIRMED' | 'DISCARDED';
  accountId: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  createdAt: string;
  rows: ImportPreviewRow[];
}

export interface ImportConfirmResult {
  id: string;
  accountId: string;
  importedRows: number;
  skippedRows: number;
}
