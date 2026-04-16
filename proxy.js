import { NextResponse } from 'next/server';
import { authMiddleware } from './lib/auth-server';

const INTERNAL_ROUTES = ['/stock', '/api/stock'];
const ALLOWED_INTERNAL_EMAILS = (process.env.ALLOWED_INTERNAL_EMAILS || ''  ).split(',').map(e => e.trim());

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;
  const postLogoutReturnTo = request.cookies.get('hm-login-return-to')?.value;

  if (pathname === '/' && postLogoutReturnTo) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hostname === 'stock.hanumantmarble.com' && pathname === '/') {
    return NextResponse.redirect(new URL('/stock', request.url));
  }

  // Check if accessing internal stock routes
  const isInternalRoute = INTERNAL_ROUTES.some(route => pathname.startsWith(route));

  if (isInternalRoute) {
    // Route handlers enforce Better Auth session and role checks.
    const response = NextResponse.next();
    response.headers.set('X-Internal-Route', 'true');
    return response;
  }

  // For non-internal routes, defer to auth provider middleware adapter.
  return await authMiddleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};