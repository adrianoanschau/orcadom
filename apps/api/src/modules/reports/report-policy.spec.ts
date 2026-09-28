import { describe, expect, it } from 'vitest';
import {
  isReportFileExpired,
  isReportStuck,
  reportExpiresAt,
  REPORT_STUCK_MS,
  REPORT_TTL_MS,
  shouldGenerateSync,
} from './report-policy.js';

describe('shouldGenerateSync', () => {
  it('gera na requisição até 2.000 lançamentos', () => {
    expect(shouldGenerateSync(0)).toBe(true);
    expect(shouldGenerateSync(2000)).toBe(true);
    expect(shouldGenerateSync(2001)).toBe(false);
  });
});

describe('report expiry', () => {
  it('expira 24 horas após a conclusão', () => {
    const completedAt = new Date('2026-09-27T12:00:00.000Z');
    const expiresAt = reportExpiresAt(completedAt);
    expect(expiresAt.getTime() - completedAt.getTime()).toBe(REPORT_TTL_MS);
    expect(isReportFileExpired(expiresAt, new Date('2026-09-28T11:59:59.000Z'))).toBe(false);
    expect(isReportFileExpired(expiresAt, new Date('2026-09-28T12:00:00.000Z'))).toBe(true);
    expect(isReportFileExpired(null)).toBe(false);
  });
});

describe('isReportStuck', () => {
  it('considera preso depois de 10 minutos', () => {
    const createdAt = new Date('2026-09-27T12:00:00.000Z');
    expect(isReportStuck(createdAt, new Date(createdAt.getTime() + REPORT_STUCK_MS - 1))).toBe(false);
    expect(isReportStuck(createdAt, new Date(createdAt.getTime() + REPORT_STUCK_MS))).toBe(true);
  });
});
