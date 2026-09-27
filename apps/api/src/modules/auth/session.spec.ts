import { describe, expect, it } from 'vitest';
import {
  clientSessionMeta,
  cookieMaxAge,
  durationMs,
  hashRefreshToken,
  isConsumedRefreshToken,
  normalizeEmail,
  refreshTtlFor,
} from './session.js';

describe('durationMs', () => {
  it('converte as unidades usadas na sessão', () => {
    expect(durationMs('15m')).toBe(15 * 60_000);
    expect(durationMs('12h')).toBe(12 * 3_600_000);
    expect(durationMs('30d')).toBe(30 * 86_400_000);
  });

  it('rejeita formato inválido', () => {
    expect(() => durationMs('15min')).toThrow(/Invalid duration/);
  });
});

describe('hashRefreshToken', () => {
  it('gera um hash estável e irreversível', () => {
    const hash = hashRefreshToken('token-secreto');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashRefreshToken('token-secreto'));
    expect(hash).not.toBe(hashRefreshToken('outro-token'));
  });
});

describe('normalizeEmail', () => {
  it('remove espaços e força minúsculas', () => {
    expect(normalizeEmail('  Ada@Orcadom.app ')).toBe('ada@orcadom.app');
  });
});

describe('política de sessão', () => {
  it('usa TTL curto sem lembrar e TTL longo com lembrar', () => {
    expect(refreshTtlFor(false, '12h', '30d')).toBe('12h');
    expect(refreshTtlFor(true, '12h', '30d')).toBe('30d');
  });

  it('só persiste cookie quando lembrar está ativo', () => {
    expect(cookieMaxAge('12h', false)).toBeUndefined();
    expect(cookieMaxAge('30d', true)).toBe(30 * 86_400_000);
  });
});

describe('isConsumedRefreshToken', () => {
  it('trata rotação e revogação como reuso', () => {
    expect(isConsumedRefreshToken({ revokedAt: null, replacedByTokenHash: null })).toBe(false);
    expect(
      isConsumedRefreshToken({ revokedAt: new Date(), replacedByTokenHash: null }),
    ).toBe(true);
    expect(
      isConsumedRefreshToken({ revokedAt: null, replacedByTokenHash: 'next-hash' }),
    ).toBe(true);
  });
});

describe('clientSessionMeta', () => {
  it('lê user-agent e o primeiro IP do forwarded', () => {
    expect(
      clientSessionMeta({
        headers: { 'user-agent': 'OrcadomTest', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      }),
    ).toEqual({ userAgent: 'OrcadomTest', ipAddress: '1.1.1.1' });
  });
});
