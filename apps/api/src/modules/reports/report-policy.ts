import { REPORT_SYNC_THRESHOLD } from '@orcadom/types';

export const REPORT_TTL_MS = 24 * 60 * 60 * 1000;
export const REPORT_STUCK_MS = 10 * 60 * 1000;

export function shouldGenerateSync(count: number): boolean {
  return count <= REPORT_SYNC_THRESHOLD;
}

export function reportExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + REPORT_TTL_MS);
}

export function isReportFileExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

export function isReportStuck(createdAt: Date, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= REPORT_STUCK_MS;
}
