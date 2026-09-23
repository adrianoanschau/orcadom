import { NextResponse, type NextRequest } from 'next/server';

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = new URL(`${apiUrl}/${path.join('/')}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (contentType) headers.set('content-type', contentType);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });

  const emptyStatus = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  const response = new NextResponse(emptyStatus ? null : await upstream.text(), {
    status: upstream.status,
  });
  const responseType = upstream.headers.get('content-type');
  if (responseType && !emptyStatus) response.headers.set('content-type', responseType);
  for (const cookieHeader of upstream.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookieHeader);
  }
  return response;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
