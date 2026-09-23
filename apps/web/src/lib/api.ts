export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/backend';

function readMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('message' in payload)) {
    return 'Não foi possível concluir a operação.';
  }
  const message = payload.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(String).join(' ');
  return 'Não foi possível concluir a operação.';
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refresh.ok) return api<T>(path, init, false);
    window.location.assign('/login');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) throw new ApiError(readMessage(payload), response.status);
  return payload as T;
}
