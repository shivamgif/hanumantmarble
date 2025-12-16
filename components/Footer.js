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
    { href: "tel:+91-9415089051", label: "+91 94150 89051", icon: Phone }
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
              Premium marble and granite products with unmatched quality and service since 1994.
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
                    className="group flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
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
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
