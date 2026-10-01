import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Product version from the repo root `package.json`, given the web app directory. */
export function readReleaseVersion(webDir: string): string {
  const pkgPath = join(webDir, '..', '..', 'package.json');
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error(`Versão ausente em ${pkgPath}`);
  }
  return parsed.version.trim();
}
