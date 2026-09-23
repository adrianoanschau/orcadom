import { parse } from 'csv-parse/sync';
import {
  classifyAmount,
  parseAmount,
  parseStatementDate,
  syntheticExternalId,
  truncateDescription,
  type ParsedStatementRow,
} from './shared.js';

const dateHeaders = new Set(['data', 'date', 'dt', 'dtposted', 'datalancamento', 'datatransacao']);
const descriptionHeaders = new Set([
  'descricao',
  'description',
  'historico',
  'memo',
  'titulo',
  'title',
  'lancamento',
  'nome',
  'estabelecimento',
]);
const amountHeaders = new Set(['valor', 'amount', 'value', 'quantia', 'valorr$']);
const typeHeaders = new Set(['tipo', 'type', 'natureza', 'trntype']);

export function parseCsv(content: string): ParsedStatementRow[] {
  const delimiter = detectDelimiter(content);
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    delimiter,
    relax_quotes: true,
  });

  if (records.length === 0) return [];

  const mapping = mapColumns(Object.keys(records[0] ?? {}));
  if (!mapping.date || !mapping.description || !mapping.amount) {
    throw new Error(
      'Não foi possível identificar as colunas de data, descrição e valor no CSV.',
    );
  }

  const rows: ParsedStatementRow[] = [];
  for (const record of records) {
    const date = parseStatementDate(record[mapping.date] ?? '');
    const amount = parseAmount(record[mapping.amount] ?? '');
    const type = classifyAmount(amount, mapping.type ? record[mapping.type] : undefined);
    const description = truncateDescription(record[mapping.description] ?? '');
    if (!date || !type || !description) continue;

    const absolute = Math.abs(amount);
    rows.push({
      date,
      description,
      amount: absolute,
      type,
      externalId: syntheticExternalId(date, absolute, description),
    });
  }

  return rows;
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const candidates: { delimiter: string; count: number }[] = [
    { delimiter: ';', count: occurrences(firstLine, ';') },
    { delimiter: ',', count: occurrences(firstLine, ',') },
    { delimiter: '\t', count: occurrences(firstLine, '\t') },
  ];
  candidates.sort((left, right) => right.count - left.count);
  return candidates[0] && candidates[0].count > 0 ? candidates[0].delimiter : ';';
}

function occurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

function mapColumns(headers: string[]): {
  date?: string;
  description?: string;
  amount?: string;
  type?: string;
} {
  const mapping: { date?: string; description?: string; amount?: string; type?: string } = {};
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (!mapping.date && dateHeaders.has(key)) mapping.date = header;
    else if (!mapping.description && descriptionHeaders.has(key)) mapping.description = header;
    else if (!mapping.amount && amountHeaders.has(key)) mapping.amount = header;
    else if (!mapping.type && typeHeaders.has(key)) mapping.type = header;
  }
  return mapping;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$]/g, '');
}
