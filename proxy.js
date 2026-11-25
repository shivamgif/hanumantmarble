import { NextResponse } from 'next/server';

const INTERNAL_ROUTES = ['/stock', '/api/stock'];

// One deploy serves both Hanumant Marble's public storefront and the stock ERP
// that other companies use. The storefront (catalogue, cart, checkout, product
// admin) only answers on these hosts; everywhere else only the ERP exists.
// NEXT_PUBLIC_ so it is inlined at build time (netlify.toml sets it).
const STOREFRONT_HOSTS = new Set(
  String(process.env.NEXT_PUBLIC_STOREFRONT_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
);
const ERP_PATHS = ['/stock', '/api/stock', '/api/auth', '/login', '/logout', '/attendance'];
const isErpPath = (pathname) => ERP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
const isStaticFile = (pathname) => /\.[a-z0-9]+$/i.test(pathname);

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  // The Host header is the domain the visitor typed; nextUrl can carry the
  // server's own host (it does in `next dev`).
  const hostname = String(request.headers.get('host') || request.nextUrl.hostname).split(':')[0].toLowerCase();
  const postLogoutReturnTo = request.cookies.get('hm-login-return-to')?.value;

  if (pathname === '/' && postLogoutReturnTo) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!STOREFRONT_HOSTS.has(hostname) && !isErpPath(pathname) && !isStaticFile(pathname)) {
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

  // Pages check auth themselves. (This used to call authMiddleware, a no-op
  // whose import built the whole better-auth server on every cold start.)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public/ files by extension (images, PDFs, manifest): the proxy never
     *   acts on a static file (isStaticFile), so they skip it entirely.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|pdf|json|txt|woff2?)$).*)",
  ],
};
