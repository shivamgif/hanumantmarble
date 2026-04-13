"use client";

import Header from './Header';
import Footer from './Footer';
import { WhatsAppButton } from './ui/whatsapp-button';
import { ScrollToTop } from './ui/scroll-to-top';
import { usePathname } from 'next/navigation';

const Layout = ({ children }) => {
  const pathname = usePathname();
  const isStockRoute = pathname?.startsWith('/stock');

  if (isStockRoute) {
    return (
      <div className="flex flex-col min-h-screen">
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
