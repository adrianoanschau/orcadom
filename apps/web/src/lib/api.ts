import { clearFinancialCaches } from '@/lib/pwa';

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
const HOUSEHOLD_STORAGE_KEY = 'orcadom.householdId';

export function getActiveHouseholdId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
}

export function setActiveHouseholdId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(HOUSEHOLD_STORAGE_KEY, id);
  else window.localStorage.removeItem(HOUSEHOLD_STORAGE_KEY);
}

function needsHouseholdHeader(path: string): boolean {
  if (path.startsWith('/auth/')) return false;
  if (path === '/profile' || path.startsWith('/profile/')) return false;
  if (path === '/households' || path.startsWith('/households?')) return false;
  if (path.startsWith('/households/invites/')) return false;
  if (path.startsWith('/notifications')) return false;
  return true;
}

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
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const householdId = getActiveHouseholdId();
  if (needsHouseholdHeader(path) && householdId && !headers.has('x-household-id')) {
    headers.set('x-household-id', householdId);
  }

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
    await endSession();
    return new Promise<T>(() => undefined);
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

export async function apiBlob(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<{ blob: Blob; fileName: string | null }> {
  const headers = new Headers(init.headers);
  const householdId = getActiveHouseholdId();
  if (needsHouseholdHeader(path) && householdId && !headers.has('x-household-id')) {
    headers.set('x-household-id', householdId);
  }

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
    if (refresh.ok) return apiBlob(path, init, false);
    await endSession();
    return new Promise<{ blob: Blob; fileName: string | null }>(() => undefined);
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
    }
    throw new ApiError(readMessage(payload), response.status);
  }

  return {
    blob: await response.blob(),
    fileName: fileNameFromDisposition(response.headers.get('content-disposition')),
  };
}

async function endSession(): Promise<void> {
  try {
    await fetch(`${baseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Sem rede o servidor não revoga a sessão; o aparelho mesmo assim esquece os dados.
  }
  await clearFinancialCaches();
  window.location.assign('/login');
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) return decodeURIComponent(utf[1]);
  const quoted = /filename="([^"]+)"/i.exec(header);
  return quoted?.[1] ?? null;
}
