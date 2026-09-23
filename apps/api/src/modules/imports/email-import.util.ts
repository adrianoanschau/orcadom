const TOKEN_RE = /(?:^|[+,;\s<])([a-z0-9]{8})(?:@|>|$)/i;
const PLUS_ALIAS_RE = /\+([a-z0-9]{8})@/i;

export function extractImportToken(value: string): string | null {
  const plus = PLUS_ALIAS_RE.exec(value);
  if (plus?.[1]) return plus[1].toLowerCase();

  const fallback = TOKEN_RE.exec(value.trim());
  return fallback?.[1]?.toLowerCase() ?? null;
}

export function buildImportAddress(token: string, mailbox = defaultMailbox()): string {
  const [local = 'importacoes', domain = 'orcadom.app'] = mailbox.split('@');
  return `${local}+${token}@${domain}`;
}

export function defaultMailbox(): string {
  return process.env.IMPORT_EMAIL_MAILBOX ?? 'importacoes@orcadom.app';
}

export function generateImportToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}
