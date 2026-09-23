import {
  classifyAmount,
  parseAmount,
  parseStatementDate,
  syntheticExternalId,
  truncateDescription,
  type ParsedStatementRow,
} from './shared.js';

export function parseOfx(content: string): ParsedStatementRow[] {
  const blocks = extractTransactionBlocks(content);
  const rows: ParsedStatementRow[] = [];

  for (const block of blocks) {
    const amount = parseAmount(readOfxField(block, 'TRNAMT') ?? '');
    const type = classifyAmount(amount, readOfxField(block, 'TRNTYPE'));
    const date = parseStatementDate(readOfxField(block, 'DTPOSTED') ?? '');
    const description = truncateDescription(
      readOfxField(block, 'MEMO') ?? readOfxField(block, 'NAME') ?? 'Lançamento importado',
    );
    if (!type || !date) continue;

    const fitid = readOfxField(block, 'FITID');
    rows.push({
      date,
      description,
      amount: Math.abs(amount),
      type,
      externalId: fitid ?? syntheticExternalId(date, Math.abs(amount), description),
    });
  }

  return rows;
}

function extractTransactionBlocks(content: string): string[] {
  const xml = [...content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((match) => match[1] ?? '');
  if (xml.length > 0) return xml;

  return content
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((part) => {
      const end = part.search(/<\/STMTTRN>|<STMTTRN>/i);
      return end === -1 ? part : part.slice(0, end);
    });
}

function readOfxField(block: string, tag: string): string | undefined {
  const xml = new RegExp(`<${tag}>\\s*([^<]*)\\s*</${tag}>`, 'i').exec(block);
  if (xml?.[1]) return xml[1].trim();

  const sgml = new RegExp(`<${tag}>([^\\n<]*)`, 'i').exec(block);
  return sgml?.[1]?.trim() ?? undefined;
}
