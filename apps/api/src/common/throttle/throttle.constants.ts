const DEFAULT_TTL_MS = 60_000;
const DEFAULT_GENERAL_LIMIT = 120;
const DEFAULT_LOGIN_LIMIT = 5;
const DEFAULT_AUTOMATION_LIMIT = 60;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const THROTTLE_TTL_MS = parsePositiveInt(process.env.THROTTLE_TTL_MS, DEFAULT_TTL_MS);

export const THROTTLE_DEFAULT_LIMIT = parsePositiveInt(
  process.env.THROTTLE_DEFAULT_LIMIT,
  DEFAULT_GENERAL_LIMIT,
);

export const THROTTLE_LOGIN_LIMIT = parsePositiveInt(
  process.env.THROTTLE_LOGIN_LIMIT,
  DEFAULT_LOGIN_LIMIT,
);

export const THROTTLE_AUTOMATION_LIMIT = parsePositiveInt(
  process.env.THROTTLE_AUTOMATION_LIMIT,
  DEFAULT_AUTOMATION_LIMIT,
);

export const THROTTLE_DISABLED = process.env.THROTTLE_DISABLED === 'true';

export const THROTTLE_ERROR_MESSAGE = 'Muitas requisições. Tente novamente em instantes.';
