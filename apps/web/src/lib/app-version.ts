const SUFFIX_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

export function sanitizeVersionSuffix(suffix?: string | null): string {
  const cleaned = suffix?.trim().replace(/^-+/, '') ?? '';
  if (!cleaned || !SUFFIX_PATTERN.test(cleaned)) return '';
  return cleaned;
}

/** Release version, plus an optional preview suffix such as `pr.15`. */
export function formatAppVersion(version: string, suffix?: string | null): string {
  const base = version.trim();
  const extra = sanitizeVersionSuffix(suffix);
  return extra ? `${base}-${extra}` : base;
}
