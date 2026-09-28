import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildPdfReport } from './report-pdf.js';
import { buildXlsxReport } from './report-xlsx.js';
import { reportFileName, reportPeriodLabel, reportTotals, type ReportMeta, type ReportRow } from './report-document.js';

const sampleRow: ReportRow = {
  date: new Date('2026-09-15T12:00:00.000Z'),
  description: 'Supermercado Extra',
  type: 'EXPENSE',
  amount: '123.45',
  accountName: 'Nubank',
  categoryName: 'Mercado',
};

const sampleMeta: ReportMeta = {
  householdName: 'Casa',
  generatedAt: new Date('2026-09-27T15:00:00.000Z'),
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
  accountName: 'Nubank',
};

describe('reportTotals', () => {
  it('soma receitas e despesas e ignora transferências', () => {
    expect(
      reportTotals([
        sampleRow,
        { ...sampleRow, type: 'INCOME', amount: '200.00' },
        { ...sampleRow, type: 'TRANSFER', amount: '50.00' },
      ]),
    ).toEqual({ income: 200, expense: 123.45 });
  });
});

describe('reportPeriodLabel', () => {
  it('formata o intervalo em português', () => {
    expect(reportPeriodLabel(sampleMeta)).toBe('01/09/2026 a 30/09/2026');
  });
});

describe('reportFileName', () => {
  it('usa a data de geração no nome', () => {
    expect(reportFileName('PDF', sampleMeta.generatedAt)).toBe('orcadom-extrato-2026-09-27.pdf');
    expect(reportFileName('XLSX', sampleMeta.generatedAt)).toBe('orcadom-extrato-2026-09-27.xlsx');
  });
});

describe('buildPdfReport', () => {
  it('gera um PDF com a descrição do lançamento', async () => {
    const buffer = await buildPdfReport([sampleRow], sampleMeta, { compress: false });
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(pdfExtractText(buffer)).toContain('Supermercado Extra');
  });
});

describe('buildXlsxReport', () => {
  it('gera uma planilha com a descrição do lançamento', async () => {
    const buffer = await buildXlsxReport([sampleRow], sampleMeta);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 2).toString('utf8')).toBe('PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const values: string[] = [];
    workbook.getWorksheet('Extrato')?.eachRow((row) => {
      row.eachCell((cell) => {
        values.push(cellText(cell.value));
      });
    });
    expect(values.join(' ')).toContain('Supermercado Extra');
  });
});

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function pdfExtractText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [];
  for (const match of raw.matchAll(/<([0-9a-fA-F]+)>/g)) {
    parts.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  return parts.join('');
}
