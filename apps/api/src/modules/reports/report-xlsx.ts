import ExcelJS from 'exceljs';
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
  reportPeriodLabel,
  reportTotals,
  reportTypeLabel,
  type ReportMeta,
  type ReportRow,
} from './report-document.js';

export async function buildXlsxReport(rows: ReportRow[], meta: ReportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Orcadom';
  workbook.created = meta.generatedAt;

  const sheet = workbook.addWorksheet('Extrato', {
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  sheet.addRow(['Extrato de lançamentos']);
  sheet.addRow([meta.householdName]);
  sheet.addRow([`Período: ${reportPeriodLabel(meta)}`]);
  if (meta.accountName) sheet.addRow([`Conta: ${meta.accountName}`]);
  if (meta.categoryName) sheet.addRow([`Categoria: ${meta.categoryName}`]);
  sheet.addRow([`Gerado em ${formatReportDateTime(meta.generatedAt)}`]);
  sheet.addRow([]);

  const { income, expense } = reportTotals(rows);
  sheet.addRow(['Receitas', formatReportMoney(income.toFixed(2))]);
  sheet.addRow(['Despesas', formatReportMoney(expense.toFixed(2))]);
  sheet.addRow(['Lançamentos', rows.length]);
  sheet.addRow([]);

  sheet.addRow(['Data', 'Descrição', 'Tipo', 'Valor', 'Conta', 'Categoria']);
  const header = sheet.lastRow;
  if (header) header.font = { bold: true };

  for (const row of rows) {
    sheet.addRow([
      formatReportDate(row.date),
      row.description,
      reportTypeLabel(row.type),
      formatReportMoney(row.amount),
      row.accountName,
      row.categoryName,
    ]);
  }

  sheet.columns = [
    { width: 14 },
    { width: 40 },
    { width: 16 },
    { width: 16 },
    { width: 24 },
    { width: 24 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
