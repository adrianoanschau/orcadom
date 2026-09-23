import { describe, expect, it } from 'vitest';
import { normalizeDescription } from './category-memory.js';

describe('normalizeDescription', () => {
  it('remove ruído e iguala descrições do mesmo estabelecimento', () => {
    expect(normalizeDescription('COMPRA IFOOD *IFD 123456 12/09')).toBe('COMPRA IFOOD IFD');
    expect(normalizeDescription('COMPRA IFOOD*IFD 987654 25/09')).toBe('COMPRA IFOOD IFD');
  });

  it('remove acentos e números de parcela', () => {
    expect(normalizeDescription('Pagamento Concessionária 02/03')).toBe('PAGAMENTO CONCESSIONARIA');
  });
});
