import { createHash } from 'node:crypto';

export const DESCRIPTION_MAX = 120;

export interface ParsedStatementRow {
  date: Date;
  description: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  externalId: string;
}

export function decodeStatementText(buffer: Buffer): string {
  const utf16 = decodeUtf16(buffer);
  if (utf16 !== null) return utf16;

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }

  const header = buffer.subarray(0, 400).toString('latin1');
  if (/CHARSET:\s*1252/i.test(header) || /ENCODING:\s*USASCII/i.test(header)) {
    return buffer.toString('latin1');
  }

  const utf8 = buffer.toString('utf8');
  if (utf8.includes('\uFFFD')) {
    return buffer.toString('latin1');
  }
  return utf8;
}

function decodeUtf16(buffer: Buffer): string | null {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return swapUtf16(buffer.subarray(2)).toString('utf16le');
  }

  const pairs = Math.floor(Math.min(buffer.length, 64) / 2);
  if (pairs < 8) return null;

  let oddZero = 0;
  let evenZero = 0;
  for (let i = 0; i < pairs; i++) {
    if (buffer[i * 2] === 0) evenZero += 1;
    if (buffer[i * 2 + 1] === 0) oddZero += 1;
  }
  if (oddZero > pairs * 0.6 && evenZero < pairs * 0.2) {
    return buffer.toString('utf16le');
  }
  if (evenZero > pairs * 0.6 && oddZero < pairs * 0.2) {
    return swapUtf16(buffer).toString('utf16le');
  }
  return null;
}

function swapUtf16(buffer: Buffer): Buffer {
  const swapped = Buffer.alloc(buffer.length - (buffer.length % 2));
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    swapped[i] = buffer[i + 1] ?? 0;
    swapped[i + 1] = buffer[i] ?? 0;
  }
  return swapped;
}

export function parseAmount(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return Number.NaN;

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const inner = trimmed.replace(/[()]/g, '').replace(/^[+-]/, '');

  let normalized = inner;
  if (inner.includes(',') && inner.includes('.')) {
    normalized =
      inner.lastIndexOf(',') > inner.lastIndexOf('.')
        ? inner.replace(/\./g, '').replace(',', '.')
        : inner.replace(/,/g, '');
  } else if (inner.includes(',')) {
    normalized = inner.replace(/\./g, '').replace(',', '.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return Number.NaN;
  return negative ? -Math.abs(value) : Math.abs(value);
}

export function parseStatementDate(raw: string): Date | null {
  const value = raw.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (ymd) return dateAtNoon(ymd[1] ?? '', ymd[2] ?? '', ymd[3] ?? '');

  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (compact) return dateAtNoon(compact[1] ?? '', compact[2] ?? '', compact[3] ?? '');

  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(value);
  if (br) return dateAtNoon(br[3] ?? '', br[2] ?? '', br[1] ?? '');

  return null;
}

export function dateAtNoon(year: string, month: string, day: string): Date | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

export function classifyAmount(
  amount: number,
  declaredType?: string,
): 'INCOME' | 'EXPENSE' | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  const token = (declaredType ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/(despesa|expense|debit|debito|saida)/.test(token)) return 'EXPENSE';
  if (/(receita|income|credit|credito|entrada)/.test(token)) return 'INCOME';
  return amount < 0 ? 'EXPENSE' : 'INCOME';
}

export function truncateDescription(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX);
}

export function syntheticExternalId(date: Date, amount: number, description: string): string {
  const day = date.toISOString().slice(0, 10);
  const payload = `${day}|${Math.abs(amount).toFixed(2)}|${description.trim()}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function detectFormat(fileName: string, content: string): 'OFX' | 'CSV' | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'ofx' || extension === 'ofc') return 'OFX';
  if (extension === 'csv' || extension === 'txt') return 'CSV';
  if (/OFXHEADER|<OFX/i.test(content.slice(0, 400))) return 'OFX';
  if (content.includes(';') || content.includes(',')) return 'CSV';
  return null;
}
