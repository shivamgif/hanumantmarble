import { NextResponse } from 'next/server';
import { auth0 } from "./lib/auth0";
import { getSession } from '@auth0/nextjs-auth0/edge';

const INTERNAL_ROUTES = ['/stock', '/api/stock'];
const ALLOWED_INTERNAL_EMAILS = (process.env.ALLOWED_INTERNAL_EMAILS || 'ssshivam.singh.2@gmail.com').split(',').map(e => e.trim());

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Check if accessing internal stock routes
  const isInternalRoute = INTERNAL_ROUTES.some(route => pathname.startsWith(route));

  if (isInternalRoute) {
    // Get Auth0 session for edge
    const session = await getSession(request);

    // No session = redirect to login
    if (!session) {
      const loginUrl = new URL('/api/auth/login', request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check if user is in allowed internal list
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

    // Add internal user headers
    const response = NextResponse.next();
    response.headers.set('X-Internal-User', session.user.email);
    response.headers.set('X-Internal-User-Id', session.user.sub);
    return response;
  }

  // For non-internal routes, use standard Auth0 middleware
  return await auth0.middleware(request);
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