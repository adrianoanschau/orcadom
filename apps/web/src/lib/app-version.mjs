const SUFFIX_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

/** @param {string | null | undefined} suffix */
export function sanitizeVersionSuffix(suffix) {
  const cleaned = suffix?.trim().replace(/^-+/, '') ?? '';
  if (!cleaned || !SUFFIX_PATTERN.test(cleaned)) return '';
  return cleaned;
}

/**
 * Release version, plus an optional preview suffix such as `pr.15`.
 * @param {string} version
 * @param {string | null | undefined} [suffix]
 * @returns {string}
 */
export function formatAppVersion(version, suffix) {
  const base = version.trim();
  const extra = sanitizeVersionSuffix(suffix);
  return extra ? `${base}-${extra}` : base;
}
