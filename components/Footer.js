import Link from "next/link";
import { Mail, Phone, Instagram, Facebook, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  const socialLinks = [
    { href: "https://instagram.com/hanumantmarble", label: "Instagram", icon: Instagram },
    { href: "https://facebook.com/hanumantmarble", label: "Facebook", icon: Facebook }
  ];

  const contactLinks = [
    { href: "mailto:hanumantmarble@rediffmail.com", label: "hanumantmarble@rediffmail.com", icon: Mail },
    { href: "tel:+91-9415089051", label: "+91 94150 89051", icon: Phone },
    {
      href: "https://wa.me/919696103802?text=" + encodeURIComponent("Hello! I'm interested in your products."),
      label: "WhatsApp Us",
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      external: true,
    },
  ];

  const quickLinks = [
    { href: "/#products", label: "Products" },
    { href: "/#brands", label: "Brands" },
    { href: "/about", label: "About Us" },
    { href: "/quote", label: "Get Quote" },
  ];

  return (
    <footer className="relative bg-gradient-to-b from-muted/30 to-muted/50 border-t border-border/50">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-10 sm:py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand Section */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Hanumant Marble</h2>
              <div className="h-1 w-12 bg-gradient-to-r from-primary to-primary/50 rounded-full"></div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Premium tiles, marble & sanitaryware with unmatched quality and service since 1994.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Lucknow, Uttar Pradesh</span>
            </div>
          </div>
          
          {/* Quick Links */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight mb-2">Quick Links</h3>
              <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full"></div>
            </div>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link 
                    href={link.href}
                    className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowRight className="h-3 w-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    <span className="group-hover:translate-x-1 transition-transform">{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Contact Links */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight mb-2">Contact Us</h3>
              <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full"></div>
            </div>
            <ul className="space-y-4">
              {contactLinks.map((link) => (
                <li key={link.href}>
                  <a 
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="group flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors flex-shrink-0">
                      <link.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="break-all">{link.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social Links */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight mb-2">Follow Us</h3>
              <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full"></div>
            </div>
            <div className="flex gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110"
                  aria-label={link.label}
                >
                  <link.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Stay connected for updates on new collections and exclusive offers.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {currentYear} Hanumant Marble. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
