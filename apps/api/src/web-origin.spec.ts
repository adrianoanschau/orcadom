import { describe, expect, it } from 'vitest';
import { parseWebOrigins } from './web-origin.js';

describe('parseWebOrigins', () => {
  it('usa o default quando a variável não existe ou vem vazia', () => {
    expect(parseWebOrigins(undefined)).toBe('http://localhost:3000');
    expect(parseWebOrigins('')).toBe('http://localhost:3000');
    expect(parseWebOrigins('  ,  ')).toBe('http://localhost:3000');
  });

  it('devolve uma string quando há uma única origem', () => {
    expect(parseWebOrigins('https://orcadom.aanschau.tech')).toBe(
      'https://orcadom.aanschau.tech',
    );
    expect(parseWebOrigins('  https://orcadom.aanschau.tech  ')).toBe(
      'https://orcadom.aanschau.tech',
    );
  });

  it('aceita várias origens separadas por vírgula', () => {
    expect(
      parseWebOrigins(
        'https://orcadom.aanschau.tech, https://api.orcadom.aanschau.tech',
      ),
    ).toEqual([
      'https://orcadom.aanschau.tech',
      'https://api.orcadom.aanschau.tech',
    ]);
  });
});
