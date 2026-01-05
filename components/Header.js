"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, Sun, Moon, Languages, ArrowRight, ShoppingCart, User, LogOut, Heart, Package, Settings, Shield } from "lucide-react"
import { useTheme } from "next-themes"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"
import { useUser } from '@auth0/nextjs-auth0/client'
import { isAdmin } from '@/lib/admin-config'

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
          <Link href="/" className="relative h-20 w-20 hover:scale-105 transition-transform">
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
        <div className="flex items-center gap-3">
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
                  {/* User Profile Section for Mobile */}
                  {user && (
                    <div className="mb-6 pb-6 border-b border-border/50">
                      {/* User Info */}
                      <div className="flex items-center gap-3 px-4 mb-4">
                        <div className="relative h-12 w-12 rounded-full overflow-hidden ring-2 ring-primary/20">
                          {user.picture ? (
                            <Image
                              src={user.picture}
                              alt={user.name || 'User'}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                              <User className="h-6 w-6 text-primary" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{user.name || 'User'}</p>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                      
                      {/* Profile Quick Actions */}
                      <div className={`grid ${isAdmin(user.email) ? 'grid-cols-4' : 'grid-cols-3'} gap-2 px-4`}>
                        <Link
                          href="/profile"
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <span className="text-xs font-medium">{getTranslation('nav.profile', language) || 'Profile'}</span>
                        </Link>
                        <Link
                          href="/orders"
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <span className="text-xs font-medium">{getTranslation('nav.orders', language) || 'Orders'}</span>
                        </Link>
                        <Link
                          href="/wishlist"
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Heart className="h-5 w-5 text-primary" />
                          </div>
                          <span className="text-xs font-medium">{getTranslation('nav.wishlist', language) || 'Wishlist'}</span>
                        </Link>
                        {isAdmin(user.email) && (
                          <Link
                            href="/admin"
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                            onClick={() => setOpen(false)}
                          >
                            <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                              <Shield className="h-5 w-5 text-amber-600" />
                            </div>
                            <span className="text-xs font-medium text-amber-600">Admin</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cart Section */}
                  <div className="flex flex-col space-y-2 mb-6 pb-6 border-b border-border/50">
                    {!user && (
                      <a
                        href="/auth/login"
                        className="group flex justify-between items-center py-3 px-4 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-all"
                        onClick={() => setOpen(false)}
                      >
                        <span className="flex items-center gap-3 text-lg font-medium">
                          <User className="h-5 w-5" />
                          {getTranslation('nav.login', language) || 'Login'}
                        </span>
                        <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </a>
                    )}
                    <Link
                      href="/#products"
                      className="group flex justify-between items-center py-3 px-4 rounded-xl text-foreground hover:bg-primary/10 hover:text-primary transition-all"
                      onClick={() => setOpen(false)}
                    >
                      <span className="flex items-center gap-3 text-lg font-medium">
                        <ShoppingCart className="h-5 w-5" />
                        {getTranslation('nav.cart', language) || 'Cart'}
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

                  {/* Logout Button for logged in users */}
                  {user && (
                    <div className="mt-6 pt-6 border-t border-border/50">
                      <a
                        href="/auth/logout"
                        className="group flex justify-between items-center py-3 px-4 rounded-xl text-red-500 hover:bg-red-500/10 transition-all"
                        onClick={() => setOpen(false)}
                      >
                        <span className="flex items-center gap-3 text-lg font-medium">
                          <LogOut className="h-5 w-5" />
                          {getTranslation('nav.logout', language) || 'Logout'}
                        </span>
                        <ArrowRight className="h-5 w-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </a>
                    </div>
                  )}
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
