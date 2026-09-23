import { describe, expect, it } from 'vitest';
import { buildImportAddress, extractImportToken } from './email-import.util.js';

describe('extractImportToken', () => {
  it('lê o token de um alias plus-addressing', () => {
    expect(extractImportToken('importacoes+ab12cd34@orcadom.app')).toBe('ab12cd34');
  });

  it('lê o token de um header To com nome de exibição', () => {
    expect(extractImportToken('Orcadom <importacoes+xy98zt76@orcadom.app>')).toBe('xy98zt76');
  });

  it('devolve null quando o endereço não tem token', () => {
    expect(extractImportToken('importacoes@orcadom.app')).toBeNull();
  });
});

describe('buildImportAddress', () => {
  it('insere o token no local-part', () => {
    expect(buildImportAddress('ab12cd34', 'importacoes@orcadom.app')).toBe(
      'importacoes+ab12cd34@orcadom.app',
    );
  });
});
