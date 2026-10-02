import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

function respond(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
}

describe('proxy', () => {
  it('não redireciona /offline, mesmo sem sessão', () => {
    const response = respond('/offline');
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('redireciona o painel para o login sem sessão', () => {
    const response = respond('/dashboard');
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('deixa /offline passar mesmo com sessão', () => {
    const response = respond('/offline', 'accessToken=token');
    expect(response.headers.get('location')).toBeNull();
  });
});
