import PDFDocument from 'pdfkit';
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

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 16;
const COLS = [70, 170, 80, 80, 80] as const;

export function buildPdfReport(
  rows: ReportRow[],
  meta: ReportMeta,
  options?: { compress?: boolean },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      compress: options?.compress ?? true,
      info: { Title: 'Extrato Orcadom' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    drawHeader(doc, meta);
    drawTotals(doc, rows);
    drawTable(doc, rows);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, meta: ReportMeta): void {
  doc.fontSize(18).fillColor('#1a1a1a').text('Extrato de lançamentos', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#444444');
  doc.text(meta.householdName);
  doc.text(`Período: ${reportPeriodLabel(meta)}`);
  if (meta.accountName) doc.text(`Conta: ${meta.accountName}`);
  if (meta.categoryName) doc.text(`Categoria: ${meta.categoryName}`);
  doc.text(`Gerado em ${formatReportDateTime(meta.generatedAt)}`);
  doc.moveDown();
}

function drawTotals(doc: PDFKit.PDFDocument, rows: ReportRow[]): void {
  const { income, expense } = reportTotals(rows);
  doc.fontSize(10).fillColor('#1a1a1a');
  doc.text(`Receitas: ${formatReportMoney(income.toFixed(2))}`);
  doc.text(`Despesas: ${formatReportMoney(expense.toFixed(2))}`);
  doc.text(`Lançamentos: ${String(rows.length)}`);
  doc.moveDown();
}

function drawTable(doc: PDFKit.PDFDocument, rows: ReportRow[]): void {
  const startX = PAGE_MARGIN;
  let y = doc.y;
  y = drawTableHeader(doc, startX, y);

  for (const row of rows) {
    if (y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawTableHeader(doc, startX, y);
    }
    drawTableRow(doc, startX, y, [
      formatReportDate(row.date),
      row.description,
      reportTypeLabel(row.type),
      formatReportMoney(row.amount),
      row.accountName,
    ]);
    y += ROW_HEIGHT;
  }
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number): number {
  doc.fontSize(8).fillColor('#1a1a1a');
  drawTableRow(doc, x, y, ['Data', 'Descrição', 'Tipo', 'Valor', 'Conta']);
  doc
    .moveTo(x, y + ROW_HEIGHT - 3)
    .lineTo(doc.page.width - PAGE_MARGIN, y + ROW_HEIGHT - 3)
    .strokeColor('#cccccc')
    .stroke();
  return y + ROW_HEIGHT;
}

function drawTableRow(doc: PDFKit.PDFDocument, x: number, y: number, cells: string[]): void {
  let cursor = x;
  cells.forEach((cell, index) => {
    const width = COLS[index] ?? 80;
    doc.text(cell, cursor, y, { width, height: ROW_HEIGHT, ellipsis: true, lineBreak: false });
    cursor += width;
  });
}
