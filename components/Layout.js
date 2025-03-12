import Header from './Header';
import Footer from './Footer';

const Layout = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow" role="main">
        {children}
      </main>
      <Footer />
    </div>
  );
};

Layout.displayName = 'Layout';

export default Layout;
