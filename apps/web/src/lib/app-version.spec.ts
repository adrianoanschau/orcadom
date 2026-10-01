import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatAppVersion, sanitizeVersionSuffix } from './app-version';
import { readReleaseVersion } from './release-version';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('formatAppVersion', () => {
  it('mantém a versão da release quando não há sufixo', () => {
    expect(formatAppVersion('0.16.0')).toBe('0.16.0');
    expect(formatAppVersion(' 0.16.0 ', '  ')).toBe('0.16.0');
    expect(formatAppVersion('0.16.0', null)).toBe('0.16.0');
  });

  it('acrescenta o sufixo de preview', () => {
    expect(formatAppVersion('0.16.0', 'pr.15')).toBe('0.16.0-pr.15');
    expect(formatAppVersion('0.16.0', '-pr.15')).toBe('0.16.0-pr.15');
  });

  it('ignora sufixo com caracteres fora do padrão', () => {
    expect(formatAppVersion('0.16.0', 'pr 15')).toBe('0.16.0');
    expect(sanitizeVersionSuffix('../etc')).toBe('');
  });
});

describe('readReleaseVersion', () => {
  it('lê a versão SemVer do package.json da raiz', () => {
    const version = readReleaseVersion(webDir);
    const root = JSON.parse(readFileSync(join(webDir, '../..', 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(version).toBe(root.version);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(formatAppVersion(version, 'pr.15')).toBe(`${version}-pr.15`);
  });
});
