import Link from "next/link";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  const socialLinks = [
    { href: "https://instagram.com/hanumantmarble", label: "Instagram", icon: "📸" },
    { href: "https://facebook.com/hanumantmarble", label: "Facebook", icon: "👥" }
  ];

  const contactLinks = [
    { href: "mailto:info@hanumantmarble.com", label: "info@hanumantmarble.com", icon: "✉️" },
    { href: "tel:+91-9999999999", label: "+91 99999 99999", icon: "📞" }
  ];

  const aboutLinks = [
    { href: "/about", label: "About Us" },
    { href: "/quote", label: "Get Quote" },
    { href: "/#products", label: "Our Products" }
  ];

  return (
    <footer className="bg-background border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">Hanumant Marble</h2>
            <p className="text-sm text-muted-foreground">
              &copy; {currentYear} Hanumant Marble.<br/>All rights reserved.
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Connect With Us</h3>
            <ul className="space-y-3">
              {socialLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={link.label}
                  >
                    <span role="img" aria-hidden="true" className="text-lg">{link.icon}</span>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Contact Us</h3>
            <ul className="space-y-3">
              {contactLinks.map((link) => (
                <li key={link.href}>
                  <a 
                    href={link.href} 
                    className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <span role="img" aria-hidden="true" className="text-lg">{link.icon}</span>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link 
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
