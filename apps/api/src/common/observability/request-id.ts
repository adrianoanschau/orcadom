const REQUEST_ID_MAX = 128;
const REQUEST_ID_PATTERN = /^[\w.:-]+$/;

export function resolveRequestId(raw: unknown, fallback: string): string {
  const value = headerValue(raw);
  if (value.length > 0 && value.length <= REQUEST_ID_MAX && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }
  return fallback;
}

function headerValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return '';
}
