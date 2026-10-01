import { createHash } from 'node:crypto';

const DURATION = /^(\d+)(ms|s|m|h|d)$/;
const FACTORS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationMs(value: string): number {
  const match = DURATION.exec(value.trim());
  const amount = match?.[1];
  const unit = match?.[2];
  const factor = unit ? FACTORS[unit] : undefined;
  if (!amount || factor === undefined) {
    throw new Error(`Invalid duration: ${value}`);
  }
  return Number(amount) * factor;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function refreshTtlFor(remember: boolean, sessionTtl: string, rememberTtl: string): string {
  return remember ? rememberTtl : sessionTtl;
}

export function cookieMaxAge(ttl: string, persistent: boolean): number | undefined {
  return persistent ? durationMs(ttl) : undefined;
}

export function isConsumedRefreshToken(token: {
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
}): boolean {
  return Boolean(token.revokedAt ?? token.replacedByTokenHash);
}

export function clientSessionMeta(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): { userAgent: string | null; ipAddress: string | null } {
  return {
    userAgent: headerValue(request.headers?.['user-agent']),
    ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
  };
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
