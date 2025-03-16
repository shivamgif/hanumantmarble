"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"

import { ScrollProgress } from "@/components/ui/scroll-progress"
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink } from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function Header() {
  const { theme, setTheme } = useTheme()
  const [isOpen, setOpen] = React.useState(false)
  
  const navigationItems = [
    { href: "/#products", label: "Products" },
    { href: "/quote", label: "Get Your Quotation" },
    { href: "/about", label: "About Us" },
  ]

  return (
    <header className="w-full z-40 sticky top-0 bg-background border-b">
      <div className="container mx-auto px-4 h-24 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <Link href="/" className="relative h-24 w-24">
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
        <div className="hidden md:flex items-center gap-6">
          <NavigationMenu>
            <NavigationMenuList>
              {navigationItems.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <Link href={item.href} legacyBehavior passHref>
                    <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50">
                      {item.label}
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right Side - Theme Toggle & Mobile Menu */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>
                    <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
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
                <div className="py-4">
                  <div className="flex flex-col space-y-4">
                    {navigationItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex justify-between items-center py-2 text-foreground hover:text-primary"
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-lg font-medium">{item.label}</span>
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
  )
}

export default Header
