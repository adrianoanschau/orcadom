import { NextResponse, type NextRequest } from 'next/server';

const protectedPrefixes = [
  '/dashboard',
  '/accounts',
  '/categories',
  '/transactions',
  '/budgets',
  '/installments',
  '/recurring',
  '/imports',
  '/settings',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(
    request.cookies.get('accessToken') ?? request.cookies.get('refreshToken'),
  );
  const isProtected =
    pathname === '/' || protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!backend|_next/static|_next/image|favicon.ico).*)'],
};
