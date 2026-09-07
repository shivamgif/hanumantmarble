"use client";

import Header from './Header';
import Footer from './Footer';
import { WhatsAppButton } from './ui/whatsapp-button';
import { ScrollToTop } from './ui/scroll-to-top';
import { usePathname } from 'next/navigation';

const Layout = ({ children }) => {
  const pathname = usePathname();
  // /attendance is the unauthenticated kiosk. It lives outside /stock because
  // that layout is the auth gate, but it is an app screen, not a storefront
  // page — no marketing header or footer on a showroom tablet.
  const isAppRoute = pathname?.startsWith('/stock') || pathname?.startsWith('/attendance');

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
      {/* <WhatsAppButton /> */}
      <ScrollToTop />
    </div>
  );
};

Layout.displayName = 'Layout';

export default Layout;
