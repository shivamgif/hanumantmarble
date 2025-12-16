"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, Sun, Moon, Languages, ArrowRight, ShoppingCart, User, LogOut } from "lucide-react"
import { useTheme } from "next-themes"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"
import { useUser } from '@auth0/nextjs-auth0/client'

import { ScrollProgress } from "@/components/ui/scroll-progress"
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink } from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { AuthButton } from "@/components/ui/AuthButton"
import { CartSummary } from "@/components/ui/CartSummary"
import { useCart } from "@/contexts/CartContext"

export function Header() {
  const { theme, setTheme } = useTheme()
  const [isOpen, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const { user } = useUser()
  const { cartCount } = useCart()
  
  const { language, toggleLanguage } = useLanguage();
  
  const navigationItems = [
    { href: "/#products", label: getTranslation('nav.products', language) },
    { href: "/#brands", label: getTranslation('nav.brands', language) },
    { href: "/quote", label: getTranslation('nav.quote', language) },
    { href: "/about", label: getTranslation('nav.about', language) },
  ]

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`w-full z-40 sticky top-0 transition-all duration-300 ${scrolled ? 'bg-background/80 backdrop-blur-xl shadow-lg border-b border-border/50' : 'bg-background border-b border-border/50'}`}>
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <Link href="/" className="relative h-16 w-16 hover:scale-105 transition-transform">
            <Image
              src="/logo.png"
              alt="Hanumant Marble Logo"
              fill
              className="object-contain"
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2">
          <NavigationMenu>
            <NavigationMenuList className="gap-1">
              {navigationItems.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink asChild>
                    <Link 
                      href={item.href} 
                      className="group inline-flex h-10 w-max items-center justify-center rounded-full bg-transparent px-5 py-2 text-sm font-medium transition-all hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary focus:outline-none"
                    >
                      {item.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right Side - Theme Toggle & Mobile Menu */}
        <div className="flex items-center gap-1">
          <div className="hidden md:flex items-center gap-1">
            <AuthButton />
            <CartSummary />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              aria-label="Toggle language"
              className="rounded-full hover:bg-primary/10"
            >
              <Languages className="h-5 w-5" />
              <span className="ml-1 text-xs font-semibold">{language.toUpperCase()}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="rounded-full hover:bg-primary/10"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-card">
                <SheetHeader>
                  <SheetTitle>
                    <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
                      <div className="relative h-12 w-12">
                        <Image
                          src="/logo.png"
                          alt="Hanumant Marble Logo"
                          fill
                          className="object-contain"
                          priority
                        />
                      </div>
                      <span className="font-semibold text-lg">Hanumant Marble</span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <div className="py-8">
                  {/* Cart & Login for Mobile */}
                  <div className="flex flex-col space-y-2 mb-6 pb-6 border-b border-border/50">
                    <a
                      href={user ? "/auth/logout" : "/auth/login"}
                      className="group flex justify-between items-center py-3 px-4 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-all"
                      onClick={() => setOpen(false)}
                    >
                      <span className="flex items-center gap-3 text-lg font-medium">
                        {user ? <LogOut className="h-5 w-5" /> : <User className="h-5 w-5" />}
                        {user ? "Logout" : "Login"}
                      </span>
                      <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </a>
                    <Link
                      href="/#products"
                      className="group flex justify-between items-center py-3 px-4 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-all"
                      onClick={() => setOpen(false)}
                    >
                      <span className="flex items-center gap-3 text-lg font-medium">
                        <ShoppingCart className="h-5 w-5" />
                        Cart
                        {cartCount > 0 && (
                          <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-medium">
                            {cartCount}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </div>
                  
                  {/* Navigation Links */}
                  <div className="flex flex-col space-y-2">
                    {navigationItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="group flex justify-between items-center py-3 px-4 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-all"
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-lg font-medium">{item.label}</span>
                        <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </Link>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      <ScrollProgress />
    </header>
  );
}

export default Header
