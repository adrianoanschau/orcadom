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
  postingStatus?: 'SCHEDULED' | 'POSTED';
  installmentPlanId?: string | null;
  installmentNumber?: number | null;
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
  scheduledCommitments: string;
  expensesByCategory: { categoryId: string | null; name: string; total: string }[];
}

export interface InstallmentPlanSummary {
  id: string;
  description: string;
  totalAmount: string;
  installmentsCount: number;
  purchaseDate: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  postedCount: number;
  scheduledCount: number;
  remainingAmount: string;
}

export interface InstallmentPlanDetail extends InstallmentPlanSummary {
  installments: {
    id: string;
    description: string;
    amount: string;
    date: string;
    postingStatus: 'SCHEDULED' | 'POSTED';
    installmentNumber: number | null;
  }[];
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
  source?: 'MANUAL' | 'EMAIL';
  status: 'PENDING' | 'UNMAPPED_ACCOUNT' | 'CONFIRMED' | 'DISCARDED';
  accountId: string | null;
  bankId?: string | null;
  acctId?: string | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  createdAt: string;
  rows: ImportPreviewRow[];
}

export interface ImportBatchSummary {
  id: string;
  fileName: string;
  format: 'OFX' | 'CSV';
  source: 'MANUAL' | 'EMAIL';
  status: 'PENDING' | 'UNMAPPED_ACCOUNT' | 'CONFIRMED' | 'DISCARDED';
  accountId: string | null;
  bankId: string | null;
  acctId: string | null;
  totalRows: number;
  duplicateRows: number;
  createdAt: string;
}

export interface ImportAlias {
  token: string;
  address: string;
  mailbox: string;
  createdAt: string;
}

export interface BankAccountMapping {
  id: string;
  bankId: string;
  acctId: string;
  accountId: string;
  accountName: string;
}

export interface EmailImportLog {
  id: string;
  messageId: string;
  recipientAddress: string;
  status: 'PROCESSED' | 'SKIPPED_DUPLICATE' | 'UNRECOGNIZED_TOKEN' | 'UNMAPPED_ACCOUNT' | 'ERROR';
  errorMessage: string | null;
  importBatchId: string | null;
  createdAt: string;
}

export type NotificationType =
  | 'BUDGET_WARNING'
  | 'BUDGET_EXCEEDED'
  | 'EMAIL_IMPORT_READY'
  | 'EMAIL_IMPORT_UNMAPPED_ACCOUNT';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: { importBatchId?: string; categoryId?: string; month?: string } | null;
  channels: ('IN_APP' | 'EMAIL')[];
  readAt: string | null;
  createdAt: string;
}

export interface ImportConfirmResult {
  id: string;
  accountId: string;
  importedRows: number;
  skippedRows: number;
}

export type BudgetStatus = 'on_track' | 'warning' | 'exceeded';

export interface BudgetProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  limit: string;
  spent: string;
  ratio: number;
  status: BudgetStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface BudgetList {
  month: string;
  budgets: BudgetProgress[];
}
