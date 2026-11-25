"use client";

import dynamic from 'next/dynamic';
import { ScrollToTop } from './ui/scroll-to-top';

// Split out: the app routes below never render the storefront chrome, so the
// stock app never downloads it. Storefront pages still server-render both.
const Header = dynamic(() => import('./Header'));
const Footer = dynamic(() => import('./Footer'));
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const Layout = ({ children }) => {
  const pathname = usePathname();
  // /attendance is the unauthenticated kiosk. It lives outside /stock because
  // that layout is the auth gate, but it is an app screen, not a storefront
  // page — no marketing header or footer on a showroom tablet.
  // /login is the product's own full-screen sign-in, so no storefront chrome either.
  const isAppRoute = pathname?.startsWith('/stock') || pathname?.startsWith('/attendance') || pathname === '/login';

  // Menus, sheets and dialogs portal into <body>, outside the wrapper below, so
  // without this they'd take the storefront's tokens and font in the app.
  useEffect(() => {
    document.body.classList.toggle('stock-scope', Boolean(isAppRoute));
    return () => document.body.classList.remove('stock-scope');
  }, [isAppRoute]);

  if (isAppRoute) {
    // stock-scope mutes the color tokens for /stock only — see styles/globals.css
    return (
      <div className="stock-scope flex flex-col min-h-screen">
        <main className="flex-grow" role="main">
          {children}
        </main>
        <ScrollToTop />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow" role="main">
        {children}
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};

Layout.displayName = 'Layout';

export default Layout;
