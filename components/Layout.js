import Header from './Header';
import Footer from './Footer';
import { WhatsAppButton } from './ui/whatsapp-button';
import { ScrollToTop } from './ui/scroll-to-top';

const Layout = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow" role="main">
        {children}
      </main>
      <Footer />
      <WhatsAppButton />
      <ScrollToTop />
    </div>
  );
};

Layout.displayName = 'Layout';

export default Layout;
