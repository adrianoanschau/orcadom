export type ReportTransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface ReportRow {
  date: Date;
  description: string;
  type: ReportTransactionType;
  amount: string;
  accountName: string;
  categoryName: string;
}

export interface ReportMeta {
  householdName: string;
  generatedAt: Date;
  from?: Date;
  to?: Date;
  accountName?: string;
  categoryName?: string;
}

const TYPE_LABELS: Record<ReportTransactionType, string> = {
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
  TRANSFER: 'Transferência',
};

export function reportTypeLabel(type: ReportTransactionType): string {
  return TYPE_LABELS[type];
}

export function formatReportMoney(amount: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(amount))
    .replace(/[\u00a0\u202f]/g, ' ');
}

export function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

export function formatReportDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function reportPeriodLabel(meta: ReportMeta): string {
  if (meta.from && meta.to) return `${formatReportDate(meta.from)} a ${formatReportDate(meta.to)}`;
  if (meta.from) return `a partir de ${formatReportDate(meta.from)}`;
  if (meta.to) return `até ${formatReportDate(meta.to)}`;
  return 'todo o período';
}

export function reportTotals(rows: ReportRow[]) {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (row.type === 'INCOME') income += amount;
    if (row.type === 'EXPENSE') expense += amount;
  }
  return { income, expense };
}

export function reportFileName(format: 'PDF' | 'XLSX', generatedAt = new Date()): string {
  const day = generatedAt.toISOString().slice(0, 10);
  const ext = format === 'PDF' ? 'pdf' : 'xlsx';
  return `orcadom-extrato-${day}.${ext}`;
}

export function reportContentType(format: 'PDF' | 'XLSX'): string {
  return format === 'PDF'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
