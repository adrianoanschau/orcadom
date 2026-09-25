import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePkgPath = join(rootDir, 'apps/api/package.json');
const rootPkgPath = join(rootDir, 'package.json');
const sourceChangelogPath = join(rootDir, 'apps/api/CHANGELOG.md');
const rootChangelogPath = join(rootDir, 'CHANGELOG.md');

const sourcePkg = JSON.parse(readFileSync(sourcePkgPath, 'utf8'));
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));

if (rootPkg.version !== sourcePkg.version) {
  rootPkg.version = sourcePkg.version;
  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
}

if (!existsSync(sourceChangelogPath)) {
  process.exit(0);
}

const latestSection = extractLatestSection(readFileSync(sourceChangelogPath, 'utf8'));
if (!latestSection) {
  process.exit(0);
}

const heading = latestSection.match(/^## .+$/m)?.[0];
const rootChangelog = existsSync(rootChangelogPath)
  ? readFileSync(rootChangelogPath, 'utf8')
  : '# Changelog\n';

if (heading && !rootChangelog.includes(heading)) {
  writeFileSync(rootChangelogPath, insertSection(rootChangelog, latestSection));
}

function extractLatestSection(changelog) {
  const match = changelog.match(/^## .+$/m);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index;
  const afterHeading = changelog.slice(start + match[0].length);
  const nextHeading = afterHeading.search(/^## /m);
  const section =
    nextHeading === -1
      ? changelog.slice(start)
      : changelog.slice(start, start + match[0].length + nextHeading);

  return `${section.trim()}\n`;
}

function insertSection(changelog, section) {
  const trimmed = changelog.replace(/\s+$/, '\n');
  const firstHeading = trimmed.search(/^## /m);

  if (firstHeading === -1) {
    return `${trimmed}\n${section}\n`;
  }

  return `${trimmed.slice(0, firstHeading)}${section}\n${trimmed.slice(firstHeading)}`;
}
