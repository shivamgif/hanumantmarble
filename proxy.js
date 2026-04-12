import { NextResponse } from 'next/server';
import { auth0 } from "./lib/auth0";

const INTERNAL_ROUTES = ['/stock', '/api/stock'];
const ALLOWED_INTERNAL_EMAILS = (process.env.ALLOWED_INTERNAL_EMAILS || 'ssshivam.singh.2@gmail.com').split(',').map(e => e.trim());

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Check if accessing internal stock routes
  const isInternalRoute = INTERNAL_ROUTES.some(route => pathname.startsWith(route));

  if (isInternalRoute) {
    // Auth0 middleware will handle authentication at the route level
    // For now, allow the request to proceed; route handlers will validate
    const response = NextResponse.next();
    response.headers.set('X-Internal-Route', 'true');
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