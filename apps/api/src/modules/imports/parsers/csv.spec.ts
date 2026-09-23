import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('parseCsv', () => {
  it('lê CSV do Bradesco com ponto e vírgula, data BR e valor com vírgula', () => {
    const rows = parseCsv(fixture('bradesco.csv'));

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      description: 'COMPRA SUPERMERCADO EXTRA',
      amount: 156.78,
      type: 'EXPENSE',
    });
    expect(rows[0]?.date.toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(rows[1]).toMatchObject({
      description: 'PIX RECEBIDO JOAO',
      amount: 250,
      type: 'INCOME',
    });
    expect(rows[0]?.externalId).toBe(rows[3]?.externalId);
  });

  it('lê CSV do Inter com vírgula, data ISO e coluna de tipo', () => {
    const rows = parseCsv(fixture('inter.csv'));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      description: 'UBER *TRIP 8891',
      amount: 18.4,
      type: 'EXPENSE',
    });
    expect(rows[1]).toMatchObject({
      description: 'SALARIO INTER TECH',
      amount: 4200,
      type: 'INCOME',
    });
    expect(rows[2]).toMatchObject({
      description: 'IFOOD *IFD 332211 21/09',
      amount: 54.9,
      type: 'EXPENSE',
    });
  });
});
