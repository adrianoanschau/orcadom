import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractOfxAccount, parseOfx } from './ofx.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('parseOfx', () => {
  it('lê OFX 1.x estilo Itaú (SGML) e usa o FITID', () => {
    const rows = parseOfx(fixture('itau.ofx'));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      description: 'COMPRA IFOOD *IFD 123456 12/09',
      amount: 89.9,
      type: 'EXPENSE',
      externalId: 'ITAU20260912008990',
    });
    expect(rows[0]?.date.toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(rows[1]).toMatchObject({
      description: 'SALARIO EMPRESA XYZ',
      amount: 3500,
      type: 'INCOME',
      externalId: 'ITAU20260905035000',
    });
  });

  it('extrai BANKID e ACCTID do OFX 1.x do Itaú', () => {
    expect(extractOfxAccount(fixture('itau.ofx'))).toEqual({
      bankId: '0341',
      acctId: '12345-6',
    });
  });

  it('lê OFX 2.x estilo Nubank (XML) e cai no NAME quando não há MEMO', () => {
    const rows = parseOfx(fixture('nubank.ofx'));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      description: 'COMPRA IFOOD*IFD 987654 15/09',
      amount: 32.5,
      type: 'EXPENSE',
      externalId: 'NU20260915003250',
    });
    expect(rows[1]).toMatchObject({
      description: 'PIX RECEBIDO MARIA SILVA',
      amount: 180,
      type: 'INCOME',
      externalId: 'NU20260901018000',
    });
  });
});
