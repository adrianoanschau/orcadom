const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

/**
 * WEB_ORIGIN aceita uma origem ou várias, separadas por vírgula.
 * Uma só origem continua string, para o CORS se comportar como antes.
 */
export function parseWebOrigins(value: string | undefined): string | string[] {
  const list = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const single = list[0];
  if (single === undefined) return DEFAULT_WEB_ORIGIN;
  if (list.length === 1) return single;
  return list;
}
