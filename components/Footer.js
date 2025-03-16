import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink } from "@/components/ui/navigation-menu";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  const socialLinks = [
    { href: "https://instagram.com/hanumantmarble", label: "Instagram", icon: "📸" },
    { href: "https://facebook.com/hanumantmarble", label: "Facebook", icon: "👥" }
  ];

  const contactLinks = [
    { href: "mailto:hanumantmarble@rediffmail.com", label: "hanumantmarble@rediffmail.com", icon: "✉️" },
    { href: "tel:+91-9415089051", label: "+91 94150 89051", icon: "📞" }
  ];

  const quickLinks = [
    { href: "/about", label: "About Us" },
    { href: "/quote", label: "Get Quote" },
  ];

  return (
    <footer className="bg-background border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Hanumant Marble</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              &copy; {currentYear} Hanumant Marble.<br/>
              Premium marble and granite products with unmatched quality and service.
            </p>
          </div>
          
          {/* Social Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight">Connect With Us</h3>
            <NavigationMenu orientation="vertical">
              <NavigationMenuList className="flex-col space-y-2">
                {socialLinks.map((link) => (
                  <NavigationMenuItem key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span role="img" aria-hidden="true" className="text-lg">{link.icon}</span>
                      {link.label}
                    </a>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          
          {/* Contact Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight">Contact Us</h3>
            <div className="space-y-3">
              {contactLinks.map((link) => (
                <Button
                  key={link.href}
                  variant="link"
                  asChild
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                >
                  <a href={link.href} className="flex items-center gap-2 justify-start">
                    <span role="img" aria-hidden="true" className="text-lg">{link.icon}</span>
                    <span className="text-sm">{link.label}</span>
                  </a>
                </Button>
              ))}
            </div>
          </div>
          
          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight">Quick Links</h3>
            <NavigationMenu orientation="vertical">
              <NavigationMenuList className="flex-col space-y-2">
                {quickLinks.map((link) => (
                  <NavigationMenuItem key={link.href}>
                    <Link href={link.href} legacyBehavior passHref>
                      <NavigationMenuLink
                        className="group inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </NavigationMenuLink>
                    </Link>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
