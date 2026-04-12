import { NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0/edge';

/**
 * Middleware to protect internal stock routes
 * Ensures only authenticated internal users can access stock subdomain
 */

const INTERNAL_ROUTES = ['/stock', '/api/stock'];
const ALLOWED_INTERNAL_EMAILS = (process.env.ALLOWED_INTERNAL_EMAILS || 'ssshivam.singh.2@gmail.com').split(',').map(e => e.trim());

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Check if this is a stock/internal route
  const isInternalRoute = INTERNAL_ROUTES.some(route => pathname.startsWith(route));

  if (isInternalRoute) {
    // Get session from Auth0
    const session = await getSession(request);

    // No session = redirect to login
    if (!session) {
      const loginUrl = new URL('/api/auth/login', request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Session exists but user is not in allowed internal list
    if (!ALLOWED_INTERNAL_EMAILS.includes(session.user.email)) {
      return NextResponse.json(
        {
          error: 'Access Denied',
          message: 'Your account does not have access to the internal stock management system.',
          email: session.user.email,
        },
        { status: 403 }
      );
    }

    // User is authenticated and authorized; add headers
    const response = NextResponse.next();
    response.headers.set('X-Internal-User', session.user.email);
    response.headers.set('X-Internal-User-Id', session.user.sub);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/stock/:path*',
    '/api/stock/:path*',
  ],
};
