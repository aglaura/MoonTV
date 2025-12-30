import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Redirect unauthenticated users to /login for all page routes.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Public paths that should never be redirected
  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/assets') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/opengraph-image') ||
    pathname.startsWith('/sitemap');

  if (isPublicPath) {
    return NextResponse.next();
  }

  const hasAuth = req.cookies.get('auth');
  if (!hasAuth) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    if (pathname) {
      const redirectTarget = `${pathname}${search || ''}`;
      loginUrl.searchParams.set('redirect', redirectTarget);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Exclude static assets and API routes from middleware processing
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest|opengraph-image|sitemap|api).*)'],
};
