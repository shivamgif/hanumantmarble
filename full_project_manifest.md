# Hanumant Marble Full Project Manifest
Generated on: Tue Apr 14 08:31:04 CEST 2026


---
### FILE: ./proxy.js
```javascript
import { NextResponse } from 'next/server';
import { auth0 } from "./lib/auth0";

const INTERNAL_ROUTES = ['/stock', '/api/stock'];
const ALLOWED_INTERNAL_EMAILS = (process.env.ALLOWED_INTERNAL_EMAILS || ''  ).split(',').map(e => e.trim());

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;
  const postLogoutReturnTo = request.cookies.get('hm-login-return-to')?.value;

  if (pathname === '/' && postLogoutReturnTo) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hostname === 'stock.hanumantmarble.com' && pathname === '/') {
    return NextResponse.redirect(new URL('/stock', request.url));
  }

  // Check if accessing internal stock routes
  const isInternalRoute = INTERNAL_ROUTES.some(route => pathname.startsWith(route));

  if (isInternalRoute) {
    // Auth0 middleware will handle authentication at the route level
    // For now, allow the request to proceed; route handlers will validate
    const response = NextResponse.next();
    response.headers.set('X-Internal-Route', 'true');
    return response;
  }

  // For non-internal routes, use standard Auth0 middleware
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```


---
### FILE: ./tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        erp: {
          primary: "#10b981",
          sidebar: "#020617",
          canvas: "#f8fafc",
          info: "#3b82f6",
          warning: "#f59e0b",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-15px)" },
        },
        "slide-up": {
          from: { transform: "translateY(50px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
        "slide-up": "slide-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "gradient-shift": "gradient-shift 4s ease infinite",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

```


---
### FILE: ./contexts/LanguageContext.js
```javascript
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);

  const toggleLanguage = () => {
    const newLanguage = language === 'en' ? 'hi' : 'en';
    setLanguage(newLanguage);
    localStorage.setItem('language', newLanguage);
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

```


---
### FILE: ./contexts/CartContext.js
```javascript
"use client"

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CART_STORAGE_KEY = 'hanumant-marble-cart';
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const CartContext = createContext({
  cartCount: 0,
  cartDetails: {},
  formattedTotalPrice: CURRENCY_FORMATTER.format(0),
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  redirectToCheckout: async () => {},
});

function readCartFromStorage() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!storedCart) {
      return {};
    }

    const parsedCart = JSON.parse(storedCart);
    return parsedCart && typeof parsedCart === 'object' ? parsedCart : {};
  } catch (error) {
    console.error('Failed to read cart from storage:', error);
    return {};
  }
}

function formatPrice(price) {
  return CURRENCY_FORMATTER.format(Number(price) || 0);
}

export const CartProvider = ({ children }) => {
  const [cartDetails, setCartDetails] = useState({});

  useEffect(() => {
    setCartDetails(readCartFromStorage());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartDetails));
  }, [cartDetails]);

  const addItem = (item) => {
    if (!item?.id) {
      return;
    }

    setCartDetails((currentCart) => {
      const existingItem = currentCart[item.id];
      const quantity = Number(item.quantity || 1);
      const nextQuantity = (existingItem?.quantity || 0) + quantity;

      return {
        ...currentCart,
        [item.id]: {
          ...existingItem,
          ...item,
          quantity: nextQuantity,
          formattedValue: formatPrice(item.price),
        },
      };
    });
  };

  const removeItem = (itemId) => {
    setCartDetails((currentCart) => {
      const nextCart = { ...currentCart };
      delete nextCart[itemId];
      return nextCart;
    });
  };

  const clearCart = () => {
    setCartDetails({});
  };

  const redirectToCheckout = async ({ shippingAddress } = {}) => {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cart: cartDetails,
        shippingAddress,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const { url } = await response.json();
    if (!url) {
      throw new Error('Checkout session did not return a redirect URL');
    }

    window.location.assign(url);
  };

  const cartCount = useMemo(
    () => Object.values(cartDetails).reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [cartDetails]
  );

  const formattedTotalPrice = useMemo(
    () => formatPrice(Object.values(cartDetails).reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0)),
    [cartDetails]
  );

  const value = useMemo(
    () => ({
      cartCount,
      cartDetails,
      formattedTotalPrice,
      addItem,
      removeItem,
      clearCart,
      redirectToCheckout,
    }),
    [cartCount, cartDetails, formattedTotalPrice]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => useContext(CartContext);

```


---
### FILE: ./contexts/ClientProviders.js
```javascript
"use client"

import { Auth0Provider } from '@auth0/nextjs-auth0/client';
import { CartProvider } from './CartContext'

export function ClientProviders({ children }) {
  return (
    <Auth0Provider>
      <CartProvider>
        {children}
      </CartProvider>
    </Auth0Provider>
  )
}
```


---
### FILE: ./app/sitemap.js
```javascript
import { getAllProducts } from "@/lib/products";

const BASE_URL = "https://hanumantmarble.in";

export default function sitemap() {
  const products = getAllProducts();

  const productUrls = products.map((product) => ({
    url: `${BASE_URL}/products/${product.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const staticPages = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/quote`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/orders`,
      lastModified: new Date(),
      changeFrequency: "never",
      priority: 0.3,
    },
  ];

  return [...staticPages, ...productUrls];
}

```


---
### FILE: ./app/layout.js
```javascript
import '@/styles/globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ClientProviders } from '@/contexts/ClientProviders'
import Layout from '@/components/Layout'

const BASE_URL = "https://hanumantmarble.in";

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Hanumant Marble – Premium Tiles & Sanitaryware in Lucknow",
    template: "%s | Hanumant Marble",
  },
  description:
    "Discover India's top brands – Kajaria, Cera, Varmora – at Hanumant Marble. 30+ years of delivering premium tiles, marble, and sanitaryware across Lucknow.",
  keywords: [
    "marble tiles Lucknow",
    "Kajaria tiles Lucknow",
    "Cera sanitaryware Lucknow",
    "tile adhesive Lucknow",
    "floor tiles Lucknow",
    "wall tiles Lucknow",
    "Hanumant Marble",
    "premium tiles India",
    "bathroom tiles Lucknow",
  ],
  authors: [{ name: "Hanumant Marble" }],
  creator: "Hanumant Marble",
  publisher: "Hanumant Marble",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BASE_URL,
    siteName: "Hanumant Marble",
    title: "Hanumant Marble – Premium Tiles & Sanitaryware in Lucknow",
    description:
      "30+ years of delivering premium tiles, marble, and sanitaryware. Visit our 4 showrooms across Lucknow.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Hanumant Marble – Premium Tiles & Sanitaryware",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hanumant Marble – Premium Tiles & Sanitaryware in Lucknow",
    description:
      "30+ years of delivering premium tiles, marble, and sanitaryware. Visit our 4 showrooms across Lucknow.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({ children }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Hanumant Marble",
    "description": "Premium tiles, marble, and sanitaryware in Lucknow with 30+ years of experience.",
    "url": BASE_URL,
    "telephone": "+91-9415089051",
    "email": "hanumantmarble@rediffmail.com",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Plot No. 10, CP/7, Tedhi Pulia Ring Rd, Sector-10",
      "addressLocality": "Lucknow",
      "addressRegion": "Uttar Pradesh",
      "postalCode": "226022",
      "addressCountry": "IN"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 26.8467,
      "longitude": 80.9462
    },
    "openingHours": "Mo-Sa 10:00-20:00",
    "priceRange": "₹₹",
    "sameAs": [
      "https://instagram.com/hanumantmarble",
      "https://facebook.com/hanumantmarble"
    ]
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LanguageProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ClientProviders>
              <Layout>
                {children}
              </Layout>
            </ClientProviders>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}

```


---
### FILE: ./app/products/[slug]/layout.js
```javascript
import { getProductBySlug } from "@/lib/products";

export async function generateMetadata({ params }) {
  const product = getProductBySlug(params.slug);

  if (!product) {
    return {
      title: "Product Not Found",
      description: "The product you are looking for could not be found.",
    };
  }

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: `${product.name} – Hanumant Marble`,
      description: product.description,
      images: [
        {
          url: product.mainImage,
          alt: product.name,
        },
      ],
    },
  };
}

export default function ProductLayout({ children }) {
  return children;
}

```


---
### FILE: ./app/products/[slug]/page.js
```javascript
"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getProductBySlug, products } from '@/lib/products';
import { useCart } from '@/contexts/CartContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Check, 
  ChevronRight, 
  Star, 
  Truck, 
  Shield, 
  RotateCcw,
  Minus,
  Plus,
  Package,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ProductPage() {
  const params = useParams();
  const { language } = useLanguage();
  const { addItem } = useCart();
  const product = getProductBySlug(params.slug);
  
  const [selectedVariant, setSelectedVariant] = useState(product?.variants?.[0] || null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex items-center justify-center">
        <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl p-8 text-center max-w-md">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Product Not Found</h1>
          <p className="text-muted-foreground mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Button asChild className="rounded-full">
            <Link href="/#products">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Products
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem({
      id: `${product.id}-${selectedVariant?.id || 'default'}`,
      name: `${language === 'hi' ? product.nameHi : product.name}${selectedVariant ? ` - ${selectedVariant.name}` : ''}`,
      price: product.price,
      image: selectedVariant?.image || product.mainImage,
      currency: "INR",
      quantity: quantity,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const currentImage = selectedVariant?.image || product.mainImage;
  const productName = language === 'hi' ? product.nameHi : product.name;
  const productDescription = language === 'hi' ? product.descriptionHi : product.description;
  const productFeatures = language === 'hi' ? product.featuresHi : product.features;
  const productCategory = language === 'hi' ? product.categoryHi : product.category;

  // Get related products (same category, excluding current)
  const relatedProducts = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/#products" className="hover:text-primary transition-colors">Products</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{productName}</span>
        </nav>

        {/* Main Product Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
                  <Image
                    src={currentImage}
                    alt={productName}
                    fill
                    className="object-contain p-8"
                    priority
                  />
                  {/* Badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {product.inStock && (
                      <Badge className="bg-green-500/90 text-white border-0">In Stock</Badge>
                    )}
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                      {productCategory}
                    </Badge>
                  </div>
                  {/* Wishlist Button */}
                  <button
                    onClick={() => setIsWishlisted(!isWishlisted)}
                    className={cn(
                      "absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
                      isWishlisted 
                        ? "bg-pink-500 text-white" 
                        : "bg-white/90 dark:bg-black/70 text-foreground hover:bg-pink-50 dark:hover:bg-pink-500/20"
                    )}
                  >
                    <Heart className={cn("h-5 w-5", isWishlisted && "fill-current")} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Variant Thumbnails */}
            {product.variants.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={cn(
                      "relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all duration-300",
                      selectedVariant?.id === variant.id
                        ? "border-primary shadow-lg scale-105"
                        : "border-border/50 hover:border-primary/50"
                    )}
                  >
                    <Image
                      src={variant.image}
                      alt={variant.name}
                      fill
                      className="object-contain p-2 bg-muted/50"
                    />
                    {selectedVariant?.id === variant.id && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Variant Names */}
            {product.variants.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                      selectedVariant?.id === variant.id
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Title & Rating */}
            <div>
              <Badge variant="outline" className="mb-3 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" />
                {productCategory}
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3">{productName}</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-5 w-5",
                        i < Math.floor(product.rating)
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-muted-foreground"
                      )}
                    />
                  ))}
                  <span className="ml-2 font-medium">{product.rating}</span>
                </div>
                <span className="text-muted-foreground">({product.reviews} reviews)</span>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold">₹{product.price.toLocaleString()}</span>
              <span className="text-muted-foreground">(Incl. of all taxes)</span>
            </div>

            {/* Short Description */}
            <p className="text-muted-foreground text-lg leading-relaxed">
              {productDescription}
            </p>

            {/* Quantity Selector */}
            <div className="flex items-center gap-4">
              <span className="font-medium">Quantity:</span>
              <div className="flex items-center rounded-full border border-border overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-10 w-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-10 w-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleAddToCart}
                size="lg"
                className={cn(
                  "flex-1 rounded-full h-14 text-lg transition-all duration-300",
                  addedToCart 
                    ? "bg-green-500 hover:bg-green-600" 
                    : "bg-primary hover:bg-primary/90"
                )}
              >
                {addedToCart ? (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Add to Cart
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full h-14"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: productName,
                      text: productDescription,
                      url: window.location.href,
                    });
                  }
                }}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                  <Truck className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-xs text-muted-foreground">Free Delivery</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <Shield className="h-5 w-5 text-green-500" />
                </div>
                <p className="text-xs text-muted-foreground">Quality Assured</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
                  <RotateCcw className="h-5 w-5 text-orange-500" />
                </div>
                <p className="text-xs text-muted-foreground">Easy Returns</p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl mb-16">
          <CardContent className="p-6">
            {/* Tab Headers */}
            <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
              {['description', 'features', 'specifications'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-6 py-3 font-medium capitalize whitespace-nowrap transition-all duration-300 border-b-2",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[200px]">
              {activeTab === 'description' && (
                <div className="prose prose-lg dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">{productDescription}</p>
                </div>
              )}

              {activeTab === 'features' && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {productFeatures.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-green-500" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}

              {activeTab === 'specifications' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-3 rounded-lg bg-muted/50">
                      <span className="font-medium">{key}</span>
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <Link key={relatedProduct.id} href={`/products/${relatedProduct.slug}`}>
                  <Card className="group bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
                        <Image
                          src={relatedProduct.mainImage}
                          alt={language === 'hi' ? relatedProduct.nameHi : relatedProduct.name}
                          fill
                          className="object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {language === 'hi' ? relatedProduct.nameHi : relatedProduct.name}
                        </h3>
                        <p className="text-lg font-bold mt-1">₹{relatedProduct.price.toLocaleString()}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

```


---
### FILE: ./app/success/page.js
```javascript
"use client"

import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { CheckCircle, ArrowRight, ShoppingBag, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

export default function SuccessPage() {
  const { clearCart } = useCart();
  const [contentRef, isContentInView] = useInView({ threshold: 0.2 });

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="relative min-h-[80vh] overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-green-500/10 rounded-full blur-3xl" />
      </div>

      <div ref={contentRef} className="container mx-auto px-4 py-12 sm:py-20 text-center relative z-10">
        {/* Success Icon */}
        <div className={cn(
          "relative inline-block mb-8 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )}>
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-2xl">
            <CheckCircle className="h-14 w-14 text-white" />
          </div>
        </div>

        {/* Badge */}
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-6 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "100ms" }}>
          <Sparkles className="w-4 h-4" />
          Order Confirmed
        </div>

        {/* Heading */}
        <h1 className={cn(
          "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "200ms" }}>
          Payment Successful!
        </h1>

        {/* Description */}
        <p className={cn(
          "text-base sm:text-lg md:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-lg mx-auto animate-on-scroll px-4",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "300ms" }}>
          Thank you for your purchase. Your order is being processed and you'll receive a confirmation email shortly.
        </p>

        {/* CTA Button */}
        <div className={cn(
          "flex flex-col sm:flex-row gap-4 justify-center animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "400ms" }}>
          <Button asChild size="lg" className="rounded-full px-8 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 border-0">
            <Link href="/" className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Continue Shopping
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

```


---
### FILE: ./app/page.js
```javascript
"use client";

import React from "react";
import dynamic from "next/dynamic";
import "../styles/Home.module.css";

const heroPlaceholder = (
  <section className="relative h-[75vh] bg-gradient-to-b from-background via-muted/30 to-background overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
  </section>
);

const sectionPlaceholder = (heightClass) => (
  <section className={`relative ${heightClass} bg-background`}>
    <div className="container mx-auto px-4 py-20">
      <div className="h-8 w-56 rounded-full bg-muted/70 animate-pulse mb-6" />
      <div className="h-5 w-80 max-w-full rounded-full bg-muted/50 animate-pulse mb-4" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    </div>
  </section>
);

const HeroCarousel = dynamic(
  () => import("../components/ui/hero-carousel").then((mod) => mod.HeroCarousel),
  { ssr: false, loading: () => heroPlaceholder }
);

const ProductsGrid = dynamic(
  () => import("../components/ui/products-grid").then((mod) => mod.ProductsGrid),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

const ProductShowcase = dynamic(
  () => import("../components/ui/product-showcase").then((mod) => mod.ProductShowcase),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

const Branches = dynamic(
  () => import("../components/ui/branches").then((mod) => mod.Branches),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

export default function Home() {
  return (
    <React.Fragment>
      <main>
        <HeroCarousel />
        <ProductsGrid />
        <ProductShowcase />
        <Branches />
      </main>
    </React.Fragment>
  );
}

```


---
### FILE: ./app/quote/layout.js
```javascript
export const metadata = {
  title: "Get a Free Quote",
  description:
    "Request a free quote for premium tiles, marble, and sanitaryware from Hanumant Marble. Expert consultation and competitive pricing guaranteed.",
  openGraph: {
    title: "Get a Free Quote – Hanumant Marble",
    description:
      "Fill out our quick form and get a detailed quote for your home or commercial project from Hanumant Marble.",
  },
};

export default function QuoteLayout({ children }) {
  return children;
}

```


---
### FILE: ./app/quote/page.js
```javascript
"use client"

import { FileText, Sparkles, Shield, MessageSquare } from 'lucide-react';
import { ProductForm } from '@/components/ui/product-form';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInView } from '@/lib/hooks/useInView';

export default function Quote() {
  const { language } = useLanguage();
  const [headerRef, isHeaderInView] = useInView({ threshold: 0.2 });

  const badges = [
    { icon: Shield, label: getTranslation('quote.badges.quality', language), color: 'from-emerald-500 to-green-500' },
    { icon: Sparkles, label: getTranslation('quote.badges.pricing', language), color: 'from-blue-500 to-cyan-500' },
    { icon: MessageSquare, label: getTranslation('quote.badges.consultation', language), color: 'from-violet-500 to-purple-500' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto py-12 sm:py-20 px-4 space-y-8 sm:space-y-12 relative z-10">
        <div ref={headerRef} className="text-center space-y-6 max-w-2xl mx-auto">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )}>
            <FileText className="w-4 h-4" />
            Request a Quote
          </div>

          <h1 className={cn(
            "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('quote.title', language)}
          </h1>

          <p className={cn(
            "text-xl text-muted-foreground leading-relaxed animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            {getTranslation('quote.subtitle', language)}
          </p>

          <div className={cn(
            "flex flex-wrap items-center justify-center gap-3 animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}>
            {badges.map((badge, index) => (
              <Badge 
                key={index}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-0 text-white bg-gradient-to-r",
                  badge.color
                )}
              >
                <badge.icon className="w-4 h-4 mr-2" />
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className={cn(
          "max-w-3xl mx-auto animate-on-scroll",
          isHeaderInView ? "in-view" : ""
        )} style={{ transitionDelay: "400ms" }}>
          <div className="rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 md:p-10 shadow-2xl">
            <ProductForm />
          </div>
        </div>
      </div>
    </div>
  );
}

```


---
### FILE: ./app/admin/page.js
```javascript
"use client";

import { useState, useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { isAdmin } from '@/lib/admin-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Package, 
  Plus, 
  Save, 
  Trash2, 
  Edit, 
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Home,
  ChevronDown,
  ChevronUp,
  ImageIcon
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function AdminPage() {
  const { user, isLoading: userLoading } = useUser();
  const [products, setProducts] = useState([]);
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

  const userIsAdmin = user && isAdmin(user.email);
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesSearch = !normalizedSearch || [
      product.name,
      product.nameHi,
      product.slug,
      product.category,
      product.categoryHi,
      product.description,
      product.descriptionHi,
      ...(product.features || []),
      ...(product.featuresHi || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);

    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'in-stock' && product.inStock) ||
      (stockFilter === 'out-of-stock' && !product.inStock);

    return matchesSearch && matchesStock;
  });

  useEffect(() => {
    if (userIsAdmin) {
      fetchProducts();
    } else {
      setLoading(false);
    }
  }, [userIsAdmin]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProducts(data.products || []);
      setSha(data.sha);
      setHasChanges(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load products: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const saveProducts = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, sha }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setMessage({ type: 'success', text: 'Products saved! Site will rebuild in ~1-2 minutes.' });
      setSha(data.sha);
      setHasChanges(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save: ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = (slug, field, value) => {
    setProducts(products.map(p => 
      p.slug === slug ? { ...p, [field]: value } : p
    ));
    setHasChanges(true);
  };

  const updateNestedField = (slug, parentField, childField, value) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return {
        ...p,
        [parentField]: {
          ...p[parentField],
          [childField]: value
        }
      };
    }));
    setHasChanges(true);
  };

  const updateArrayField = (slug, field, index, value) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      const newArray = [...p[field]];
      newArray[index] = value;
      return { ...p, [field]: newArray };
    }));
    setHasChanges(true);
  };

  const addArrayItem = (slug, field, item) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return { ...p, [field]: [...p[field], item] };
    }));
    setHasChanges(true);
  };

  const removeArrayItem = (slug, field, index) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return { ...p, [field]: p[field].filter((_, i) => i !== index) };
    }));
    setHasChanges(true);
  };

  const deleteProduct = (slug) => {
    if (confirm('Are you sure you want to delete this product? This cannot be undone.')) {
      setProducts(products.filter(p => p.slug !== slug));
      setHasChanges(true);
      setEditingProduct(null);
    }
  };

  const addProduct = () => {
    const timestamp = Date.now();
    const newProduct = {
      id: `new-product-${timestamp}`,
      slug: `new-product-${timestamp}`,
      name: 'New Product',
      nameHi: 'नया उत्पाद',
      category: 'Uncategorized',
      categoryHi: 'अवर्गीकृत',
      description: 'Product description goes here.',
      descriptionHi: 'उत्पाद विवरण यहाँ जाएगा।',
      price: 0,
      rating: 5,
      reviews: 0,
      inStock: true,
      features: ['Feature 1'],
      featuresHi: ['विशेषता 1'],
      specifications: { 'Key': 'Value' },
      variants: [{ id: `v-${timestamp}`, name: 'Standard', image: '/products/placeholder.png' }],
      mainImage: '/products/placeholder.png'
    };
    setProducts([...products, newProduct]);
    setEditingProduct(newProduct.slug);
    setExpandedProduct(newProduct.slug);
    setHasChanges(true);
  };

  const duplicateProduct = (product) => {
    const timestamp = Date.now();
    const copy = {
      ...product,
      id: `${product.id || product.slug}-copy-${timestamp}`,
      slug: `${product.slug}-copy-${timestamp}`,
      name: `${product.name} Copy`,
      nameHi: `${product.nameHi || product.name} कॉपी`,
    };

    setProducts([...products, copy]);
    setEditingProduct(copy.slug);
    setExpandedProduct(copy.slug);
    setHasChanges(true);
  };

  // Loading state
  if (userLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Admin Access Required</h1>
            <p className="text-muted-foreground mb-6">Please login to access the admin panel.</p>
            <Button asChild className="rounded-full">
              <a href="/auth/login">Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not an admin
  if (!userIsAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-red-500/5 p-4">
        <Card className="w-full max-w-md border-red-500/20">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-2">You don't have admin privileges.</p>
            <p className="text-sm text-muted-foreground mb-6">Logged in as: {user.email}</p>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Sticky Header */}
      <div className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold">Admin Panel</h1>
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  Unsaved Changes
                </Badge>
              )}
              <Button 
                onClick={saveProducts} 
                disabled={saving || !hasChanges}
                className="rounded-full"
                size="sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button asChild variant="outline" className="rounded-full" size="sm">
                <Link href="/">
                  <Home className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Site</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message.text && (
        <div className="container mx-auto px-4 pt-4">
          <div className={`flex items-center gap-2 p-4 rounded-xl ${
            message.type === 'success' 
              ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
              : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Products Header */}
        <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">Products ({filteredProducts.length}/{products.length})</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Search and edit products in a table-style browser. Changes stay local until you press Save.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, slug, category, description..."
              className="min-w-[280px] rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All stock states</option>
              <option value="in-stock">In stock</option>
              <option value="out-of-stock">Out of stock</option>
            </select>
            <Button onClick={addProduct} className="rounded-full" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Products List */}
        <div className="space-y-4">
          {filteredProducts.map((product) => (
            <Card key={product.slug} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Product Header - Always visible */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedProduct(expandedProduct === product.slug ? null : product.slug)}
                >
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    {product.mainImage ? (
                      <Image
                        src={product.mainImage}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{product.nameHi}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                      <span className="text-sm font-medium">₹{product.price}</span>
                      <span className="text-xs text-muted-foreground">
                        {product.variants?.length || 0} variants
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProduct(editingProduct === product.slug ? null : product.slug);
                        setExpandedProduct(product.slug);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateProduct(product);
                      }}
                      title="Duplicate product"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {expandedProduct === product.slug ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedProduct === product.slug && (
                  <div className="border-t border-border/50 p-4 bg-muted/30">
                    <div className="mb-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">Slug: {product.slug}</div>
                      <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">ID: {product.id}</div>
                      <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">Variants: {product.variants?.length || 0}</div>
                    </div>
                    {editingProduct === product.slug ? (
                      /* Edit Mode */
                      <div className="space-y-6">
                        {/* Basic Info */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h4>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium mb-1 block">Name (English)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.name}
                                onChange={(e) => updateProduct(product.slug, 'name', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Name (Hindi)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.nameHi}
                                onChange={(e) => updateProduct(product.slug, 'nameHi', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Slug (URL)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.slug}
                                onChange={(e) => {
                                  const newSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                                  updateProduct(product.slug, 'slug', newSlug);
                                  updateProduct(product.slug, 'id', newSlug);
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Price (₹)</label>
                              <input
                                type="number"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.price}
                                onChange={(e) => updateProduct(product.slug, 'price', Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Category (English)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.category}
                                onChange={(e) => updateProduct(product.slug, 'category', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Category (Hindi)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.categoryHi}
                                onChange={(e) => updateProduct(product.slug, 'categoryHi', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Main Image Path</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.mainImage}
                                onChange={(e) => updateProduct(product.slug, 'mainImage', e.target.value)}
                                placeholder="/products/image.png"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`inStock-${product.slug}`}
                                checked={product.inStock}
                                onChange={(e) => updateProduct(product.slug, 'inStock', e.target.checked)}
                                className="rounded"
                              />
                              <label htmlFor={`inStock-${product.slug}`} className="text-sm font-medium">In Stock</label>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Description</h4>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium mb-1 block">English</label>
                              <textarea
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                value={product.description}
                                onChange={(e) => updateProduct(product.slug, 'description', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Hindi</label>
                              <textarea
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                value={product.descriptionHi}
                                onChange={(e) => updateProduct(product.slug, 'descriptionHi', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Features */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Features</h4>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium mb-2 block">English</label>
                              {product.features?.map((feature, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={feature}
                                    onChange={(e) => updateArrayField(product.slug, 'features', idx, e.target.value)}
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-9 w-9 text-red-500"
                                    onClick={() => removeArrayItem(product.slug, 'features', idx)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addArrayItem(product.slug, 'features', 'New feature')}
                              >
                                <Plus className="h-4 w-4 mr-1" /> Add
                              </Button>
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-2 block">Hindi</label>
                              {product.featuresHi?.map((feature, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={feature}
                                    onChange={(e) => updateArrayField(product.slug, 'featuresHi', idx, e.target.value)}
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-9 w-9 text-red-500"
                                    onClick={() => removeArrayItem(product.slug, 'featuresHi', idx)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addArrayItem(product.slug, 'featuresHi', 'नई विशेषता')}
                              >
                                <Plus className="h-4 w-4 mr-1" /> Add
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Variants */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Variants</h4>
                          <div className="space-y-3">
                            {product.variants?.map((variant, idx) => (
                              <div key={variant.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                                <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                  {variant.image && (
                                    <Image src={variant.image} alt={variant.name} fill className="object-cover" />
                                  )}
                                </div>
                                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Variant name"
                                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={variant.name}
                                    onChange={(e) => {
                                      const newVariants = [...product.variants];
                                      newVariants[idx] = { ...variant, name: e.target.value };
                                      updateProduct(product.slug, 'variants', newVariants);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="/products/image.png"
                                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={variant.image}
                                    onChange={(e) => {
                                      const newVariants = [...product.variants];
                                      newVariants[idx] = { ...variant, image: e.target.value };
                                      updateProduct(product.slug, 'variants', newVariants);
                                    }}
                                  />
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="text-red-500"
                                  onClick={() => {
                                    const newVariants = product.variants.filter((_, i) => i !== idx);
                                    updateProduct(product.slug, 'variants', newVariants);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const newVariants = [
                                  ...product.variants,
                                  { id: `v-${Date.now()}`, name: 'New Variant', image: '/products/placeholder.png' }
                                ];
                                updateProduct(product.slug, 'variants', newVariants);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Variant
                            </Button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => deleteProduct(product.slug)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Product
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingProduct(null)}
                          >
                            Done Editing
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {product.features?.slice(0, 4).map((feature, idx) => (
                            <Badge key={idx} variant="outline">{feature}</Badge>
                          ))}
                          {product.features?.length > 4 && (
                            <Badge variant="outline">+{product.features.length - 4} more</Badge>
                          )}
                        </div>
                        {product.variants?.length > 1 && (
                          <div className="flex gap-2">
                            {product.variants.map((variant) => (
                              <div key={variant.id} className="relative h-12 w-12 rounded-lg overflow-hidden border border-border">
                                <Image src={variant.image} alt={variant.name} fill className="object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setEditingProduct(product.slug)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Product
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">Get started by adding your first product.</p>
            <Button onClick={addProduct} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

```


---
### FILE: ./app/about/layout.js
```javascript
export const metadata = {
  title: "About Us",
  description:
    "Learn about Hanumant Marble's 30+ years of experience delivering premium tiles, marble, and sanitaryware across Lucknow.",
  openGraph: {
    title: "About Hanumant Marble – 30 Years of Excellence",
    description:
      "From a single showroom to 4 locations, discover the story behind Lucknow's most trusted tile and marble brand.",
  },
};

export default function AboutLayout({ children }) {
  return children;
}

```


---
### FILE: ./app/about/page.js
```javascript
"use client"

import Image from "next/image";
import { Award, Star, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

export default function About() {
  const { language } = useLanguage();
  const [heroRef, isHeroInView] = useInView({ threshold: 0.2 });
  const [galleryRef, isGalleryInView] = useInView({ threshold: 0.1 });
  const [awardsRef, isAwardsInView] = useInView({ threshold: 0.2 });

  const galleryImages = [
    "/gallery1.jpeg",
    "/gallery2.jpeg",
    "/gallery3.jpeg",
    "/gallery4.jpeg",
    "/gallery5.jpeg",
    "/gallery6.jpeg",
  ];

  const awards = getTranslation('about.awards.list', language);

  return (
    <div className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-12 sm:py-20 space-y-16 sm:space-y-24 relative z-10">
        {/* Hero Section */}
        <section ref={heroRef} className="text-center space-y-12">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )}>
            <Building2 className="w-4 h-4" />
            Our Story
          </div>

          <h1 className={cn(
            "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('about.title', language)}
          </h1>

          <p className={cn(
            "text-base sm:text-lg md:text-xl text-muted-foreground mx-auto max-w-3xl leading-relaxed animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            {getTranslation('about.intro', language)}
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className={cn(
              "group rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "300ms" }}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-3">Our Commitment</h3>
              <p className="leading-relaxed text-muted-foreground">
                {getTranslation('about.commitment', language)}
              </p>
            </div>
            <div className={cn(
              "group rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "400ms" }}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-3">Our Facility</h3>
              <p className="leading-relaxed text-muted-foreground">
                {getTranslation('about.facility', language)}
              </p>
            </div>
          </div>
        </section>

        {/* Gallery Section */}
        <section ref={galleryRef} className="space-y-12">
          <div className="text-center">
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
              isGalleryInView ? "in-view" : ""
            )}>
              <Sparkles className="w-4 h-4" />
              Showcase
            </div>
            <h2 className={cn(
              "text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight animate-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "100ms" }}>
              {getTranslation('about.gallery.title', language)}
            </h2>
            <div className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-4 rounded-full scale-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "200ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div 
                key={index} 
                className={cn(
                  "group relative h-72 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
                  isGalleryInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                <Image
                  src={image}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="absolute bottom-4 left-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <p className="text-white font-medium">Premium Collection {index + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Awards Section */}
        <section ref={awardsRef} className="space-y-12">
          <div className="text-center">
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
              isAwardsInView ? "in-view" : ""
            )}>
              <Award className="w-4 h-4" />
              Recognition
            </div>
            <h2 className={cn(
              "text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight animate-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "100ms" }}>
              {getTranslation('about.awards.title', language)}
            </h2>
            <div className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-4 rounded-full scale-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "200ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award, index) => (
              <div
                key={index}
                className={cn(
                  "group relative rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll overflow-hidden",
                  isAwardsInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                {/* Decorative gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                
                <Badge className="mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  {award.year}
                </Badge>
                <h3 className="text-xl font-semibold tracking-tight mb-2">{award.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {award.organization}
                </p>
                
                {/* Award icon */}
                <div className="absolute bottom-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Award className="w-16 h-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

```


---
### FILE: ./app/not-found.js
```javascript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Page Not Found – Hanumant Marble",
  description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 text-center relative z-10">
        {/* Large 404 */}
        <p className="text-8xl sm:text-9xl font-extrabold text-primary/10 select-none mb-4 leading-none">
          404
        </p>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Page Not Found
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto mb-10 leading-relaxed">
          Oops! The page you're looking for doesn't exist or may have been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="rounded-full px-8 h-12">
            <Link href="/" className="flex items-center gap-2">
              <Home className="h-4 w-4" aria-hidden="true" />
              Back to Home
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8 h-12">
            <Link href="/quote" className="flex items-center gap-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              Get a Quote
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

```


---
### FILE: ./app/profile/page.js
```javascript
"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import Link from 'next/link';
import { User, ShoppingBag, Heart, Settings, LogOut, Mail, Calendar, Shield, ChevronRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function ProfilePage() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your profile...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { icon: ShoppingBag, label: 'My Orders', href: '/orders', description: 'View your order history', color: 'from-blue-500 to-cyan-500' },
    { icon: Heart, label: 'Wishlist', href: '/wishlist', description: 'Items you\'ve saved', color: 'from-pink-500 to-rose-500' },
    { icon: Settings, label: 'Settings', href: '/profile', description: 'Account preferences', color: 'from-violet-500 to-purple-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            My Account
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">Profile Settings</h1>
          <p className="text-muted-foreground max-w-md mx-auto">Manage your account settings and preferences</p>
        </div>

        <div className="max-w-4xl mx-auto grid gap-8">
          {/* Profile Card */}
          <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-8 relative">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Avatar Section */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || 'Profile'}
                      className="relative h-28 w-28 rounded-full object-cover border-4 border-background shadow-xl"
                    />
                  ) : (
                    <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center border-4 border-background shadow-xl">
                      <User className="h-12 w-12 text-white" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-green-500 rounded-full border-4 border-background flex items-center justify-center">
                    <Shield className="h-3 w-3 text-white" />
                  </div>
                </div>

                {/* User Info */}
                <div className="text-center sm:text-left flex-1">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-1">{user?.name}</h2>
                  <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mb-3">
                    <Mail className="h-4 w-4" />
                    {user?.email}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                      Verified Account
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                      Member
                    </Badge>
                  </div>
                </div>

                {/* Edit Profile Button */}
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="/auth/logout" className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {menuItems.map((item, index) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className={cn(
                  "h-full bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                )}>
                  <CardContent className="p-6 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <div className={cn(
                      "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300",
                      item.color
                    )}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                      {item.label}
                      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Account Details Card */}
          <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{user?.name || 'Not provided'}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Email Address</p>
                  <p className="font-medium">{user?.email || 'Not provided'}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <p className="font-medium flex items-center gap-2">
                    <span className="h-2 w-2 bg-green-500 rounded-full" />
                    Active
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Member Since
                  </p>
                  <p className="font-medium">{user?.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default withPageAuthRequired(ProfilePage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});

```


---
### FILE: ./app/robots.js
```javascript
const BASE_URL = "https://hanumantmarble.in";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/debug-session/",
          "/account/",
          "/profile/",
          "/orders/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

```


---
### FILE: ./app/api/checkout/route.js
```javascript
import Stripe from 'stripe';
import { auth0 } from '@/lib/auth0';
import { ordersDB } from '@/lib/db/orders';

export async function POST(request) {
  try {
    const { cart, shippingAddress } = await request.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Get user session
    const session = await auth0.getSession(request);

    const line_items = Object.values(cart || {}).map((item) => ({
      price_data: {
        currency: 'inr',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        // Expecting item.price in major units (e.g., INR). Convert to paise.
        unit_amount: Math.round(Number(item.price) * 100) || 0,
      },
      quantity: item.quantity || 1,
    })).filter(li => li.price_data.unit_amount > 0);

    if (!line_items.length) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400 });
    }

    // Calculate totals
    const subtotal = line_items.reduce((sum, item) => sum + (item.price_data.unit_amount * item.quantity / 100), 0);
    const tax = subtotal * 0.18; // 18% GST
    const shipping = subtotal > 5000 ? 0 : 100; // Free shipping over ₹5000
    const total = subtotal + tax + shipping;

    // Create order in database before checkout
    let order = null;
    if (session) {
      order = await ordersDB.create({
        userId: session.user.sub,
        userEmail: session.user.email,
        userName: session.user.name,
        items: Object.values(cart).map(item => ({
          name: item.name,
          quantity: item.quantity || 1,
          price: item.price,
        })),
        shippingAddress: shippingAddress || { pending: true },
        paymentMethod: 'stripe',
        subtotal,
        tax,
        shipping,
        total,
        status: 'pending',
        paymentStatus: 'pending',
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order?.id || ''}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/?success=false`,
      metadata: {
        orderId: order?.id || '',
      },
    });

    return new Response(JSON.stringify({ id: checkoutSession.id, url: checkoutSession.url, orderId: order?.id }), { status: 200 });
  } catch (err) {
    console.error('Checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

```


---
### FILE: ./app/api/orders/route.js
```javascript
import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { ordersDB } from '@/lib/db/orders';

// GET /api/orders - Get all orders for the authenticated user
export async function GET(request) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;
    const orders = await ordersDB.getByUserEmail(userEmail);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

// POST /api/orders - Create a new order
export async function POST(request) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items, shippingAddress, paymentMethod, total, subtotal, tax, shipping } = body;

    // Validate required fields
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must contain at least one item' },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    // Create order
    const order = await ordersDB.create({
      userId: session.user.sub,
      userEmail: session.user.email,
      userName: session.user.name,
      items,
      shippingAddress,
      paymentMethod: paymentMethod || 'pending',
      total,
      subtotal,
      tax,
      shipping,
      status: 'pending',
      paymentStatus: 'pending',
      trackingNumber: null,
      estimatedDelivery: null,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

```


---
### FILE: ./app/orders/page.js
```javascript
"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, Package, Truck, CheckCircle2, Clock, ArrowRight, Sparkles, ChevronRight, Calendar, CreditCard, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function OrdersPage() {
  const { user, isLoading } = useUser();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (user) {
        setLoadingOrders(true);
        try {
          const response = await fetch('/api/orders');
          if (response.ok) {
            const data = await response.json();
            // Format orders for display
            const formattedOrders = data.orders.map(order => ({
              id: order.id,
              date: new Date(order.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }),
              total: `$${order.total.toFixed(2)}`,
              status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
              items: order.items,
            }));
            setOrders(formattedOrders);
          } else {
            console.error('Failed to fetch orders');
          }
        } catch (error) {
          console.error('Error fetching orders:', error);
        } finally {
          setLoadingOrders(false);
        }
      }
    };

    fetchOrders();
  }, [user]);

  const getStatusConfig = (status) => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return { 
          icon: CheckCircle2, 
          color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
          iconColor: 'text-green-500',
          gradient: 'from-green-500 to-emerald-500'
        };
      case 'shipped':
        return { 
          icon: Truck, 
          color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          iconColor: 'text-blue-500',
          gradient: 'from-blue-500 to-cyan-500'
        };
      case 'processing':
        return { 
          icon: Package, 
          color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
          iconColor: 'text-orange-500',
          gradient: 'from-orange-500 to-amber-500'
        };
      default:
        return { 
          icon: Clock, 
          color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
          iconColor: 'text-yellow-500',
          gradient: 'from-yellow-500 to-orange-500'
        };
    }
  };

  if (isLoading || loadingOrders) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your orders...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            Order History
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">My Orders</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {orders.length > 0 
              ? `You have ${orders.length} order${orders.length !== 1 ? 's' : ''} in your history`
              : 'Track and manage all your orders in one place'
            }
          </p>
        </div>

        {orders.length === 0 ? (
          /* Empty State */
          <Card className="max-w-md mx-auto bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <CardContent className="p-12 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
              <div className="relative">
                <div className="relative mx-auto w-24 h-24 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-30" />
                  <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <ShoppingBag className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
                <p className="text-muted-foreground mb-6">Start shopping to see your orders here!</p>
                <Button className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all duration-300" asChild>
                  <Link href="/#products" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Start Shopping
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Orders List */
          <div className="max-w-4xl mx-auto space-y-4">
            {orders.map((order, index) => {
              const statusConfig = getStatusConfig(order.status);
              const StatusIcon = statusConfig.icon;
              const isExpanded = expandedOrder === order.id;

              return (
                <Card 
                  key={order.id} 
                  className={cn(
                    "bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer",
                  )}
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <CardContent className="p-0">
                    {/* Order Header */}
                    <div className="p-6 relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-primary/5 pointer-events-none" />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
                        {/* Order Info */}
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg shrink-0",
                            statusConfig.gradient
                          )}>
                            <StatusIcon className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground mb-0.5">Order ID</p>
                            <p className="font-mono font-semibold text-sm sm:text-base">{order.id.slice(0, 16)}...</p>
                          </div>
                        </div>

                        {/* Order Meta */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                          <div className="text-left sm:text-right">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Date
                            </p>
                            <p className="font-medium text-sm">{order.date}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              Total
                            </p>
                            <p className="font-bold text-lg">{order.total}</p>
                          </div>
                          <Badge className={cn("h-fit", statusConfig.color)}>
                            <StatusIcon className={cn("h-3 w-3 mr-1", statusConfig.iconColor)} />
                            {order.status}
                          </Badge>
                          <ChevronRight className={cn(
                            "h-5 w-5 text-muted-foreground transition-transform duration-300 hidden sm:block",
                            isExpanded && "rotate-90"
                          )} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <div className={cn(
                      "overflow-hidden transition-all duration-300",
                      isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    )}>
                      <div className="px-6 pb-6 pt-2 border-t border-border/50">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Order Items ({order.items.length})
                        </h4>
                        <div className="space-y-2">
                          {order.items.map((item, itemIndex) => (
                            <div 
                              key={itemIndex} 
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-muted to-muted-foreground/10 flex items-center justify-center">
                                  <Package className="h-5 w-5 text-muted-foreground/50" />
                                </div>
                                <span className="font-medium">{item.name}</span>
                              </div>
                              <Badge variant="secondary">x{item.quantity}</Badge>
                            </div>
                          ))}
                        </div>
                        
                        {/* Order Actions */}
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                          <Button variant="outline" size="sm" className="rounded-full">
                            <MapPin className="h-4 w-4 mr-2" />
                            Track Order
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-full">
                            View Details
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Continue Shopping CTA */}
        {orders.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" className="rounded-full px-8" asChild>
              <Link href="/" className="flex items-center gap-2">
                Continue Shopping
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withPageAuthRequired(OrdersPage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});

```


---
### FILE: ./app/stock/layout.js
```javascript
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, FileText, Home, Languages, Menu, MoonStar, PackagePlus, Search, SunMedium, Users, LogOut } from 'lucide-react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function SidebarNavItem({ Icon, Label, Href, IsActive }) {
  return (
    <Link
      href={Href}
      title={Label}
      aria-label={Label}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
        IsActive
          ? 'bg-emerald-500/10 text-emerald-400 border-r-4 border-emerald-500 shadow-[inset_-4px_0_12px_rgba(16,185,129,0.05)]'
          : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{Label}</span>
    </Link>
  );
}

const CLASSES = {
  shell: 'relative min-h-screen bg-slate-950 font-sans text-slate-100',
  sidebar: 'fixed inset-y-0 left-0 z-30 hidden h-screen w-64 overflow-y-auto border-r border-white/10 bg-slate-950 lg:block',
  mobileTrigger: 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 md:hidden',
  topbar: 'sticky top-0 z-20 border-b border-slate-200/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80 sm:px-6 lg:px-8',
  actionIconButton: 'h-9 w-9 rounded-xl hover:bg-slate-100 transition-all active:scale-95 dark:hover:bg-slate-800',
};

/**
 * Layout for internal stock management routes
 * Enforces authentication and internal-only access
 */
export default function StockLayout({ children }) {
  const { user, isLoading, error } = useUser();
  const { language, toggleLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [collapsed, setCollapsed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [notificationUpdating, setNotificationUpdating] = useState(false);
  const [showNotificationDebug, setShowNotificationDebug] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const t = (key) => getTranslation(`stock.layout.${key}`, language);
  const isDarkTheme = resolvedTheme === 'dark';
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;
  function handleStockLogout() {
    document.cookie = `hm-login-return-to=${encodeURIComponent('/stock')}; Path=/; Max-Age=300; SameSite=Lax`;
    window.location.href = `/auth/logout?returnTo=${encodeURIComponent(window.location.origin)}`;
  }

  const navigationItems = [
    { href: '/stock', label: t('dashboard'), icon: Home },
  ];

  if (accessRole === 'admin' || accessRole === 'manager') {
    navigationItems.push({ href: '/stock/admin', label: t('adminDashboard'), icon: Users });
  }

  const isActiveRoute = (href) => {
    const cleanHref = href.split('#')[0];

    if (cleanHref === '/stock') {
      return pathname === '/stock';
    }

    return pathname?.startsWith(cleanHref);
  };

  useEffect(() => {
    const storedCollapsed = window.localStorage.getItem('stock-sidebar-collapsed');
    if (storedCollapsed !== null) {
      setCollapsed(storedCollapsed === 'true');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('stock-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      if (!user) {
        return;
      }

      setAccessLoading(true);
      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const result = await response.json();

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setAccessApproved(false);
          setAccessMessage(result.error || t('accessFallback'));
          return;
        }

        setAccessApproved(Boolean(result.approved));
        setAccessMessage(result.message || t('accessPendingFallback'));
        setAccessRole(result.role || 'stock_maintainer');
      } catch (accessError) {
        if (!mounted) {
          return;
        }

        setAccessApproved(false);
        setAccessMessage(accessError.message || t('accessFallback'));
      } finally {
        if (mounted) {
          setAccessLoading(false);
        }
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [user]);

  async function loadNotifications({ silent = false } = {}) {
    if (!silent) {
      setNotificationLoading(true);
    }

    try {
      const response = await fetch('/api/stock/notifications?limit=25', { cache: 'no-store' });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load notifications');
      }

      setNotifications(json.notifications || []);
      setUnreadCount(Number(json.unreadCount || 0));
      setNotificationError(null);
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      if (!silent) {
        setNotificationLoading(false);
      }
    }
  }

  async function markAllNotificationsRead() {
    setNotificationUpdating(true);

    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllRead' }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to mark notifications read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      setNotificationUpdating(false);
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', id: notificationId }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || 'Failed to mark notification read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    }
  }

  function handleNotificationNavigate(notification) {
    if (!notification?.is_read) {
      markNotificationRead(notification.id);
    }
    setNotificationOpen(false);
  }

  useEffect(() => {
    if (!accessApproved || !user) {
      return;
    }

    loadNotifications();

    const intervalId = setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);

    return () => clearInterval(intervalId);
  }, [accessApproved, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t('accessError')}</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <BrandedLoginPage returnTo="/stock" />;
  }

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-600 mt-4">{t('loadingAccess')}</p>
        </div>
      </div>
    );
  }

  if (!accessApproved) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-border bg-muted/40">
                <Image
                  src="/logo.png"
                  alt="Hanumant Marble logo"
                  fill
                  sizes="48px"
                  className="object-contain p-1.5"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hanumant Marble</p>
                <p className="text-sm text-muted-foreground">Stock management access</p>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('waitingApproval')}</h1>
            <p className="mt-3 text-muted-foreground">{accessMessage}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('waitingDetails')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={handleStockLogout} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60">{t('logout')}</button>
              <Link href="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">{t('goWebsite')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CLASSES.shell}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <aside className={CLASSES.sidebar}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
            <Image
              src="/logo.png"
              alt="Hanumant Marble logo"
              fill
              sizes="48px"
              className="object-contain p-1.5"
              priority
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">HANUMANT</p>
            <p className="text-base font-semibold text-slate-100">{t('brand')}</p>
          </div>
        </div>

        <div className="space-y-4 px-3 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-emerald-500/10 hover:text-emerald-300"
              aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
            >
              <Languages className="h-4 w-4" />
              <span>{language.toUpperCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative inline-flex rounded-full border border-white/10 bg-slate-900 p-2 text-slate-300 transition hover:bg-emerald-500/10 hover:text-emerald-300"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>

          <nav className="space-y-1">
            {navigationItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                Icon={item.icon}
                Label={item.label}
                Href={item.href}
                IsActive={isActiveRoute(item.href)}
              />
            ))}
          </nav>
        </div>

        <div className="mt-auto space-y-3 border-t border-white/10 px-3 py-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{t('signedInAs')}</p>
            <p className="mt-1 break-words text-xs text-slate-200">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-emerald-500/10 hover:text-emerald-300"
              title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              <span className="text-xs">{isDarkTheme ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={handleStockLogout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-emerald-500/10 hover:text-emerald-300"
              title={t('logout')}
              aria-label={t('logout')}
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs">{t('logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm border-white/10 bg-slate-950 p-0 text-slate-100">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
              <Image src="/logo.png" alt="Hanumant Marble logo" fill sizes="40px" className="object-contain p-1.5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">HANUMANT</p>
              <p className="text-base font-semibold text-slate-100">{t('brand')}</p>
            </div>
          </div>
          <div className="space-y-3 px-3 py-4">
            {navigationItems.map((item) => (
              <Link
                key={`mobile-nav-${item.href}`}
                onClick={() => {
                  setMobileNavOpen(false);
                }}
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${
                  isActiveRoute(item.href)
                    ? 'bg-emerald-500/10 text-emerald-400 border-r-4 border-emerald-500 shadow-[inset_-4px_0_12px_rgba(16,185,129,0.05)]'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
                aria-label={item.label}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className={CLASSES.mobileTrigger}
                aria-label="Open stock navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">ERP Workspace</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">Stock operations and approvals</p>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search Hub (CMD+K)"
                className="w-80 rounded-xl border-none bg-slate-100 px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-900 dark:text-slate-200"
                readOnly
              />
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400">CMD+K</span>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
        <footer className="border-t border-white/10 bg-slate-900/60 px-4 py-4 text-center text-sm text-slate-400 sm:px-6 lg:px-8">
          <p>{t('footerTitle')} • {t('footerUpdated')}: {new Date().toLocaleString()}</p>
        </footer>
      </div>

      <Sheet open={notificationOpen} onOpenChange={setNotificationOpen}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[420px]">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Operational alerts and shipment updates from stock workflow.</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {unreadCount} unread
            </div>
            <div className="flex items-center gap-2">
              {accessRole === 'admin' ? (
                <button
                  type="button"
                  onClick={() => setShowNotificationDebug((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                >
                  {showNotificationDebug ? 'Hide Debug' : 'Debug'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={markAllNotificationsRead}
                disabled={notificationUpdating || unreadCount === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            </div>
          </div>

          {notificationError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {notificationError}
            </div>
          ) : null}

          {notificationLoading ? (
            <div className="mt-4 text-sm text-muted-foreground">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {notifications.map((notification) => (
                (() => {
                  const recipients = Array.isArray(notification.recipients)
                    ? notification.recipients
                    : (() => {
                        try {
                          const parsed = JSON.parse(notification.recipients || '[]');
                          return Array.isArray(parsed) ? parsed : [];
                        } catch {
                          return [];
                        }
                      })();

                  const departments = [...new Set(
                    recipients
                      .map((recipient) => String(recipient?.department || '').trim())
                      .filter(Boolean)
                  )];

                  const departmentLabel = departments.length === 0
                    ? null
                    : departments.length === 1
                      ? departments[0]
                      : `${departments.length} departments`;

                  const firstWhatsappPayload = recipients.find((recipient) => recipient?.whatsappPayload)?.whatsappPayload || null;

                  return (
                    <Link
                      key={notification.id}
                      href={notification.actionHref || '/stock'}
                      onClick={() => handleNotificationNavigate(notification)}
                      className={`block w-full rounded-xl border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/5 ${
                        notification.is_read ? 'border-border bg-card' : 'border-primary/25 bg-primary/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{notification.event_type.replace(/_/g, ' ')}</p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {notification.channel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-foreground/85">{notification.message_text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {departmentLabel ? (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-semibold">
                            Target: {departmentLabel}
                          </span>
                        ) : null}
                        {departments.length > 0 ? (
                          <span>{recipients.length} recipients • {departments.length} dept</span>
                        ) : null}
                      </div>
                      {showNotificationDebug && accessRole === 'admin' && firstWhatsappPayload ? (
                        <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-[10px] text-foreground/80">
{JSON.stringify(firstWhatsappPayload, null, 2)}
                        </pre>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p>
                        <span className="text-[11px] font-semibold text-primary">Open</span>
                      </div>
                    </Link>
                  );
                })()
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

```


---
### FILE: ./app/stock/page.js
```javascript
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Boxes, CircleAlert, PackageCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import PaginationControls from '@/components/ui/pagination-controls';

function createArrivalItemRow() {
  return {
    itemId: '',
    sku: '',
    itemName: '',
    brandName: '',
    typeName: '',
    sizeLabel: '',
    sizeUnit: 'mm',
    tilesPerBox: '',
    piecesPerBox: '',
    reorderLevel: '',
    description: '',
    wholeQty: '0',
    brokenQty: '0',
    notes: '',
  };
}

function createDispatchItemRow() {
  return {
    itemId: '',
    loadedWholeQty: '0',
    loadedBrokenQty: '0',
    notes: '',
  };
}

function createInitialArrivalDraft() {
  return {
    shipmentNumber: '',
    supplierName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createArrivalItemRow()],
  };
}

function createInitialDispatchDraft() {
  return {
    shipmentNumber: '',
    customerName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createDispatchItemRow()],
  };
}

function createInitialAttachmentState() {
  return {
    purchaseInvoice: null,
    transporterBill: null,
    salesInvoice: null,
    gatepass: null,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimText(value) {
  return String(value ?? '').trim();
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeGeneratedByRole(role) {
  const normalized = String(role || '').trim().toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'manager') return 'manager';
  if (normalized === 'salesperson' || normalized === 'sales_person' || normalized === 'sales') return 'salesperson';
  if (normalized === 'stock_maintainer') return 'stock_maintainer';
  return 'unknown';
}

function getGeneratedByRoleBadgeClass(role) {
  switch (normalizeGeneratedByRole(role)) {
    case 'admin':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'manager':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'salesperson':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'stock_maintainer':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function getGeneratedByRoleLabel(role) {
  const normalized = normalizeGeneratedByRole(role);

  if (normalized === 'admin') return 'Admin';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'salesperson') return 'Salesperson';
  if (normalized === 'stock_maintainer') return 'Maintainer';
  return 'Legacy';
}

const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';
const FORM_CARD_CLASS = 'rounded-2xl border border-border/80 bg-muted/20 p-4';

const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] space-y-6',
  topCard: 'rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900',
  interactiveCard: 'rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
  statGrid: 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4',
  statCard: 'rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-900',
  statLabel: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  statValue: 'mt-2 text-3xl font-bold text-slate-900 dark:text-white',
  iconButton: 'h-9 w-9 rounded-xl hover:bg-slate-100 transition-all active:scale-95 dark:hover:bg-slate-800',
};

function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized.includes('active') || normalized.includes('complete')) {
    return 'approved';
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('warning')) {
    return 'pending';
  }
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('critical')) {
    return 'rejected';
  }
  return 'neutral';
}

function renderDocumentPreview(document) {
  if (!document?.file_url) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No preview available.
      </div>
    );
  }

  if (document.mime_type?.startsWith('image/')) {
    return (
      <img
        src={document.file_url}
        alt={document.file_name || 'Document preview'}
        className="max-h-80 w-full rounded-2xl border border-slate-200 object-contain bg-black/5"
      />
    );
  }

  return (
    <iframe
      src={document.file_url}
      title={document.file_name || 'Document preview'}
      className="h-80 w-full rounded-2xl border border-slate-200 bg-white"
    />
  );
}

function normalizeSearchValue(value) {
  return trimText(value).toLowerCase();
}

function matchesQuery(value, query) {
  if (!query) {
    return true;
  }

  return normalizeSearchValue(value).includes(query);
}

function normalizeItemKey(value) {
  return normalizeSearchValue(value).replace(/\s+/g, ' ');
}

function findMatchingActiveItem(activeItems, value) {
  const normalizedValue = normalizeItemKey(value);
  if (!normalizedValue) {
    return null;
  }

  return (activeItems || []).find((item) => (
    normalizeItemKey(item.name) === normalizedValue || normalizeItemKey(item.sku) === normalizedValue
  )) || null;
}

function InlineNotice({ notice }) {
  if (!notice) {
    return null;
  }

  const toneClasses =
    notice.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : notice.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <div className={`rounded-lg border px-3 py-2 text-sm ${toneClasses}`}>{notice.message}</div>;
}

function AttachmentField({ label, accept = 'image/*,.pdf', onChange, file, hint }) {
  return (
    <label className="block">
      <span className={FORM_LABEL_CLASS}>{label}</span>
      <input
        type="file"
        accept={accept}
        className={FORM_INPUT_CLASS}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="mt-1 text-[11px] text-muted-foreground">
        {hint || 'Attach a photo or PDF.'}
        {file ? ` Selected: ${file.name}` : ''}
      </div>
    </label>
  );
}

async function fetchDashboardData() {
  const response = await fetch('/api/stock/dashboard');
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || json.message || 'Fetch failed');
  }

  return json;
}

export default function StockDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.dashboard.${key}`, language);
  const { user, isLoading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState(null);
  const [dispatchNotice, setDispatchNotice] = useState(null);
  const [arrivalSearch, setArrivalSearch] = useState('');
  const [dispatchSearch, setDispatchSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [arrivalSort, setArrivalSort] = useState({ key: 'datetime', direction: 'desc' });
  const [dispatchSort, setDispatchSort] = useState({ key: 'datetime', direction: 'desc' });
  const [stockSort, setStockSort] = useState({ key: 'sku', direction: 'asc' });
  const [activeTableView, setActiveTableView] = useState('items');
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [highlightedShipmentKey, setHighlightedShipmentKey] = useState(null);
  const [stockPage, setStockPage] = useState(1);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [arrivalDraft, setArrivalDraft] = useState(() => createInitialArrivalDraft());
  const [dispatchDraft, setDispatchDraft] = useState(() => createInitialDispatchDraft());
  const [arrivalAttachments, setArrivalAttachments] = useState(() => createInitialAttachmentState());
  const [dispatchAttachments, setDispatchAttachments] = useState(() => createInitialAttachmentState());
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });

  async function refreshDashboard() {
    const json = await fetchDashboardData();
    setData(json);
    return json;
  }

  const canCreateArrival = accessRole !== 'salesperson';

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setError(null);
      try {
        const json = await fetchDashboardData();
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (userLoading) {
      return () => {
        mounted = false;
      };
    }

    if (!user) {
      setLoading(false);
      setError('Unauthorized');
      return () => {
        mounted = false;
      };
    }

    loadData();

    return () => { mounted = false; };
  }, [user, userLoading]);

  useEffect(() => {
    let mounted = true;

    async function loadAccessRole() {
      if (!user) {
        return;
      }

      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const json = await response.json();

        if (!mounted) {
          return;
        }

        if (response.ok) {
          setAccessRole(String(json.role || 'stock_maintainer'));
        }
      } catch {
        // Keep fallback role for UI-only gating if access lookup fails.
      }
    }

    loadAccessRole();

    return () => {
      mounted = false;
    };
  }, [user]);

  function updateArrivalDraft(field, value) {
    setArrivalDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateDispatchDraft(field, value) {
    setDispatchDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function uploadShipmentDocument({ entityType, entityId, documentType, file, documentNumber, notes }) {
    if (!file) {
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', String(entityId));
    formData.append('documentType', documentType);
    if (documentNumber) {
      formData.append('documentNumber', documentNumber);
    }
    if (notes) {
      formData.append('notes', notes);
    }

    const response = await fetch('/api/stock/documents', {
      method: 'POST',
      body: formData,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || json.detail || `Failed to upload ${documentType}`);
    }

    return json.document;
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;
    setPreviewItemsPage(1);

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading full shipment details…',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) {
        throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      }

      if (!documentsResponse.ok) {
        throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');
      }

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound shipment detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  async function openStockItemPreview(item) {
    setPreviewItemsPage(1);
    setPreviewState({
      open: true,
      loading: false,
      kind: 'stock',
      title: `${item.sku} • ${item.name}`,
      description: 'Current stock item details',
      record: item,
      items: [],
      documents: [],
      error: null,
    });
  }

  function updateArrivalItem(index, field, value) {
    setArrivalDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function autoPopulateArrivalItem(index, matchedItem) {
    setArrivalDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return {
          ...item,
          itemId: String(matchedItem.id),
          itemName: matchedItem.name || item.itemName,
          sku: matchedItem.sku || item.sku,
          brandName: matchedItem.brand_name || item.brandName,
          typeName: matchedItem.type_name || item.typeName,
          sizeLabel: matchedItem.size_label || item.sizeLabel,
          sizeUnit: matchedItem.size_unit || item.sizeUnit || 'mm',
          tilesPerBox: matchedItem.tiles_per_box != null ? String(matchedItem.tiles_per_box) : item.tilesPerBox,
          piecesPerBox: matchedItem.pieces_per_box != null ? String(matchedItem.pieces_per_box) : item.piecesPerBox,
          reorderLevel: matchedItem.reorder_level != null ? String(matchedItem.reorder_level) : item.reorderLevel,
          description: matchedItem.description || item.description,
        };
      }),
    }));
  }

  function handleArrivalItemNameChange(index, value) {
    updateArrivalItem(index, 'itemName', value);

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    updateArrivalItem(index, 'itemId', '');
  }

  function handleArrivalItemSkuChange(index, value) {
    updateArrivalItem(index, 'sku', value);

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    updateArrivalItem(index, 'itemId', '');
  }

  function updateDispatchItem(index, field, value) {
    setDispatchDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function addArrivalItemRow() {
    setArrivalDraft((current) => ({
      ...current,
      items: [...current.items, createArrivalItemRow()],
    }));
  }

  function addDispatchItemRow() {
    setDispatchDraft((current) => ({
      ...current,
      items: [...current.items, createDispatchItemRow()],
    }));
  }

  function toggleSort(sortState, setSortState, key) {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function getSortedRows(rows, sortState, accessors) {
    const sortedRows = [...rows];

    sortedRows.sort((left, right) => {
      const leftValue = accessors[sortState.key]?.(left);
      const rightValue = accessors[sortState.key]?.(right);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue == null) {
        return 1;
      }

      if (rightValue == null) {
        return -1;
      }

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortState.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }

      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

      return sortState.direction === 'asc' ? comparison : -comparison;
    });

    return sortedRows;
  }

  async function handleArrivalSubmit(event) {
    event.preventDefault();
    setArrivalNotice(null);
    setArrivalSubmitting(true);

    if (!canCreateArrival) {
      setArrivalNotice({
        type: 'warning',
        message: 'Insufficient permission: salespeople can review stock and create dispatches, but cannot log new arrivals.',
      });
      setArrivalSubmitting(false);
      return;
    }

    try {
      const items = arrivalDraft.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          sku: trimText(item.sku),
          itemName: trimText(item.itemName),
          brandName: trimText(item.brandName),
          typeName: trimText(item.typeName),
          sizeLabel: trimText(item.sizeLabel),
          sizeUnit: trimText(item.sizeUnit) || 'mm',
          tilesPerBox: toNumber(item.tilesPerBox),
          piecesPerBox: toNumber(item.piecesPerBox),
          reorderLevel: toNumber(item.reorderLevel),
          description: trimText(item.description),
          wholeQty: toNumber(item.wholeQty),
          brokenQty: toNumber(item.brokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.itemName || item.wholeQty > 0 || item.brokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one arrival item.');
      }

      if (items.some((item) => !item.itemId && (!item.itemName || !item.brandName || !item.typeName || !item.sizeLabel))) {
        throw new Error('Pick an existing tile from autocomplete or enter tile name, brand, type, and size for a new tile.');
      }

      if (items.some((item) => item.wholeQty === 0 && item.brokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each arrival row.');
      }

      const response = await fetch('/api/stock/inbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentNumber: trimText(arrivalDraft.shipmentNumber) || undefined,
          supplierName: trimText(arrivalDraft.supplierName) || undefined,
          truckLicensePlate: trimText(arrivalDraft.truckLicensePlate) || undefined,
          truckNumber: trimText(arrivalDraft.truckLicensePlate) || undefined,
          driverName: trimText(arrivalDraft.driverName) || undefined,
          invoiceNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          deliveryCost: toNumber(arrivalDraft.transportCost),
          unloadingLabourCost: toNumber(arrivalDraft.laborCost),
          notes: trimText(arrivalDraft.notes) || undefined,
          items: items.map((item) => ({
            itemId: item.itemId ? Number(item.itemId) : undefined,
            sku: item.sku || undefined,
            itemName: item.itemName || undefined,
            brandName: item.brandName || undefined,
            typeName: item.typeName || undefined,
            sizeLabel: item.sizeLabel || undefined,
            sizeUnit: item.sizeUnit || undefined,
            tilesPerBox: item.tilesPerBox || undefined,
            piecesPerBox: item.piecesPerBox || undefined,
            reorderLevel: item.reorderLevel || undefined,
            description: item.description || undefined,
            wholeQty: item.wholeQty,
            brokenQty: item.brokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit arrival');
      }

      setArrivalDraft(createInitialArrivalDraft());
      setArrivalAttachments(createInitialAttachmentState());
      setArrivalNotice({
        type: 'success',
        message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });
      try {
        const linkedInvoice = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'purchase_invoice',
          file: arrivalAttachments.purchaseInvoice,
          documentNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          notes: trimText(arrivalDraft.notes) || undefined,
        });
        if (linkedInvoice) {
          setArrivalNotice({ type: 'success', message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review and invoice attached.` });
        }

        const linkedBill = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'transporter_bill',
          file: arrivalAttachments.transporterBill,
          documentNumber: trimText(arrivalDraft.invoiceNumber) || undefined,
          notes: trimText(arrivalDraft.notes) || undefined,
        });
        if (linkedBill) {
          setArrivalNotice({ type: 'success', message: `Arrival ${json.shipment?.shipment_number || 'submitted'} sent for review and documents attached.` });
        }
      } catch (uploadError) {
        setArrivalNotice({
          type: 'warning',
          message: `Arrival saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setArrivalNotice({
          type: 'warning',
          message: `Arrival saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setArrivalNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setArrivalSubmitting(false);
    }
  }

  async function handleDispatchSubmit(event) {
    event.preventDefault();
    setDispatchNotice(null);
    setDispatchSubmitting(true);

    try {
      const customerName = trimText(dispatchDraft.customerName);
      if (!customerName) {
        throw new Error('Customer name is required.');
      }

      const items = dispatchDraft.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          loadedWholeQty: toNumber(item.loadedWholeQty),
          loadedBrokenQty: toNumber(item.loadedBrokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.loadedWholeQty > 0 || item.loadedBrokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one dispatch item.');
      }

      if (items.some((item) => !item.itemId)) {
        throw new Error('Select a stock item for each dispatch row.');
      }

      if (items.some((item) => item.loadedWholeQty === 0 && item.loadedBrokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each dispatch row.');
      }

      const response = await fetch('/api/stock/outbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentNumber: trimText(dispatchDraft.shipmentNumber) || undefined,
          customerName,
          truckLicensePlate: trimText(dispatchDraft.truckLicensePlate) || undefined,
          truckNumber: trimText(dispatchDraft.truckLicensePlate) || undefined,
          driverName: trimText(dispatchDraft.driverName) || undefined,
          invoiceNumber: trimText(dispatchDraft.invoiceNumber) || undefined,
          salespersonName: trimText(dispatchDraft.salespersonName) || undefined,
          transportCost: toNumber(dispatchDraft.transportCost),
          loadingLabourCost: toNumber(dispatchDraft.laborCost),
          notes: trimText(dispatchDraft.notes) || undefined,
          items: items.map((item) => ({
            itemId: Number(item.itemId),
            loadedWholeQty: item.loadedWholeQty,
            loadedBrokenQty: item.loadedBrokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit dispatch');
      }

      setDispatchDraft(createInitialDispatchDraft());
      setDispatchAttachments(createInitialAttachmentState());
      setDispatchNotice({
        type: 'success',
        message: `Dispatch ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });

      try {
        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'sales_invoice',
          file: dispatchAttachments.salesInvoice,
          documentNumber: trimText(dispatchDraft.invoiceNumber) || undefined,
          notes: trimText(dispatchDraft.notes) || undefined,
        });

        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'gatepass',
          file: dispatchAttachments.gatepass,
          documentNumber: trimText(dispatchDraft.shipmentNumber) || undefined,
          notes: trimText(dispatchDraft.notes) || undefined,
        });
      } catch (uploadError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setDispatchNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setDispatchSubmitting(false);
    }
  }

  const tableViewTabs = [
    { id: 'items', label: t('currentStock') },
    { id: 'arrivals', label: t('arrivals') },
    { id: 'dispatches', label: t('dispatches') },
  ];

  const arrivalRows = getSortedRows(
    (data?.recentArrivals || []).filter((shipment) => {
      const query = normalizeSearchValue(arrivalSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.arrival_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    arrivalSort,
    {
      datetime: (shipment) => new Date(shipment.arrival_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const dispatchRows = getSortedRows(
    (data?.recentDispatches || []).filter((shipment) => {
      const query = normalizeSearchValue(dispatchSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.dispatch_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    dispatchSort,
    {
      datetime: (shipment) => new Date(shipment.dispatch_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const stockRows = getSortedRows(
    (data?.activeItems || []).filter((item) => {
      const query = normalizeSearchValue(stockSearch);
      if (!query) {
        return true;
      }

      return [item.sku, item.name, item.size_label, item.current_whole_qty, item.current_broken_qty, item.reorder_level]
        .some((value) => matchesQuery(value, query));
    }),
    stockSort,
    {
      sku: (item) => item.sku || '',
      name: (item) => item.name || '',
      size: (item) => item.size_label || '',
      whole: (item) => Number(item.current_whole_qty || 0),
      broken: (item) => Number(item.current_broken_qty || 0),
      reorder: (item) => Number(item.reorder_level || 0),
    }
  );

  const stockPagination = paginateRows(stockRows, stockPage, DEFAULT_PAGE_SIZE);
  const arrivalPagination = paginateRows(arrivalRows, arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(dispatchRows, dispatchPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setStockPage((current) => Math.min(current, stockPagination.pageCount));
  }, [stockPagination.pageCount]);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const view = searchParams.get('view');
    const entityType = searchParams.get('entityType');
    const entityIdRaw = searchParams.get('entityId');
    const entityId = Number(entityIdRaw);

    if (view === 'items' || view === 'arrivals' || view === 'dispatches') {
      setActiveTableView(view);
    }

    if (!entityType || !entityId || Number.isNaN(entityId)) {
      return;
    }

    const deepLinkKey = `${entityType}:${entityId}`;
    if (processedDeepLink === deepLinkKey) {
      return;
    }

    if (entityType === 'inbound_shipment') {
      const target = (data.recentArrivals || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('arrivals');
      setHighlightedShipmentKey(`arrival-${entityId}`);
      openShipmentPreview('arrival', target || { id: entityId, shipment_number: `INB-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
      return;
    }

    if (entityType === 'outbound_shipment') {
      const target = (data.recentDispatches || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('dispatches');
      setHighlightedShipmentKey(`dispatch-${entityId}`);
      openShipmentPreview('dispatch', target || { id: entityId, shipment_number: `OUT-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
    }
  }, [data, processedDeepLink, searchParams]);

  useEffect(() => {
    if (!highlightedShipmentKey) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHighlightedShipmentKey(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [highlightedShipmentKey]);

  const totalWholeStock = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_whole_qty || 0), 0);
  const totalBrokenStock = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_broken_qty || 0), 0);
  const totalStockUnits = totalWholeStock + totalBrokenStock;
  const pendingArrivals = (data?.recentArrivals || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
  const pendingDispatches = (data?.recentDispatches || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
  const riskItems = (data?.activeItems || []).filter((item) => Number(item.reorder_level || 0) > 0 && (Number(item.current_whole_qty || 0) + Number(item.current_broken_qty || 0)) <= Number(item.reorder_level || 0)).length;

  const stockStats = [
    {
      label: 'Total Stock',
      value: totalStockUnits,
      trend: totalStockUnits ? Math.round((totalWholeStock / totalStockUnits) * 100) : 0,
      trendLabel: 'Whole ratio',
      icon: Boxes,
      accent: 'from-emerald-500/20 to-emerald-500/5',
    },
    {
      label: 'Pending Arrivals',
      value: pendingArrivals,
      trend: pendingArrivals === 0 ? 100 : -Math.min(pendingArrivals * 10, 100),
      trendLabel: 'Queue health',
      icon: PackageCheck,
      accent: 'from-blue-500/20 to-blue-500/5',
    },
    {
      label: 'Pending Dispatches',
      value: pendingDispatches,
      trend: pendingDispatches === 0 ? 100 : -Math.min(pendingDispatches * 10, 100),
      trendLabel: 'Dispatch readiness',
      icon: BarChart3,
      accent: 'from-amber-500/20 to-amber-500/5',
    },
    {
      label: 'Reorder Risks',
      value: riskItems,
      trend: riskItems === 0 ? 100 : -Math.min(riskItems * 12, 100),
      trendLabel: 'Safety score',
      icon: CircleAlert,
      accent: 'from-rose-500/20 to-rose-500/5',
    },
  ];

  if (loading) {
    return (
      <div className={CLASSES.contentWrap}>
        <div className={CLASSES.statGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`stock-stat-skeleton-${index}`} className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className={CLASSES.contentWrap}>
      <div className={CLASSES.topCard}>
        <h1 className="text-lg font-semibold text-foreground">Stock Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Focused view for maintainers: current stock, arrivals, and dispatches.</p>
      </div>

      <div className={CLASSES.statGrid}>
        {stockStats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend >= 0;

          return (
            <div key={stat.label} className={CLASSES.statCard}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={CLASSES.statLabel}>{stat.label}</p>
                  <p className={`${CLASSES.statValue} font-mono`}>{stat.value}</p>
                </div>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} text-slate-700 dark:text-slate-100`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">{stat.trendLabel}</span>
                <Badge variant={isPositive ? 'approved' : 'rejected'}>{isPositive ? '+' : ''}{stat.trend}%</Badge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white p-1 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-3 gap-1">
          {tableViewTabs.map((tab) => {
            const isActive = activeTableView === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTableView(tab.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm duration-300'
                    : 'text-muted-foreground duration-300 hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTableView === 'items' && (
        <div className="stock-tab-panel" key="stock-panel-items">
        <div id="current-stock" className="overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-base font-semibold text-foreground">{t('currentStock')}</h2>
          <span className="text-xs text-muted-foreground">{data?.activeItems?.length || 0} {t('items')}</span>
        </div>
        <div className="border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <input
            type="search"
            value={stockSearch}
            onChange={(event) => setStockSearch(event.target.value)}
            placeholder="Search items by SKU, name, size, or quantities"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'sku')} className="font-medium hover:text-foreground">
                    {t('sku')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'name')} className="font-medium hover:text-foreground">
                    {t('name')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'size')} className="font-medium hover:text-foreground">
                    {t('size')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'whole')} className="font-medium hover:text-foreground">
                    {t('whole')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'broken')} className="font-medium hover:text-foreground">
                    {t('broken')}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'reorder')} className="font-medium hover:text-foreground">
                    {t('reorder')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {stockPagination.rows.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer bg-white transition hover:bg-slate-50 focus-within:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40"
                  onClick={() => openStockItemPreview(item)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openStockItemPreview(item);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="border-r border-slate-100 px-3 py-2 font-mono font-medium text-foreground dark:border-slate-800">{item.sku}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]" title={item.name}>{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.size_label}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{item.current_whole_qty}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{item.current_broken_qty}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{item.reorder_level}</td>
                </tr>
              ))}
              {stockPagination.total === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <Boxes className="h-6 w-6 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No stock items found for this filter.</p>
                      <button
                        type="button"
                        onClick={() => setStockSearch('')}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        Reset Search
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={stockPagination.page}
          pageCount={stockPagination.pageCount}
          total={stockPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setStockPage}
        />
      </div>
        </div>
      )}
      {activeTableView === 'arrivals' && (
        <div className="stock-tab-panel" key="stock-panel-arrivals">
        <section id="arrivals" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-base font-semibold text-foreground">{t('arrivals')}</h2>
              <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => setArrivalNotice(null)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!canCreateArrival}
                  title={!canCreateArrival ? 'Insufficient permission for New Arrival' : undefined}
                >
                  + {t('newArrival')}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[50vw]">
                <SheetHeader>
                  <SheetTitle>{t('logNewArrival')}</SheetTitle>
                  <SheetDescription>{t('logNewArrivalDesc')}</SheetDescription>
                </SheetHeader>
                <form className="mt-6 space-y-5" onSubmit={handleArrivalSubmit}>
                  <InlineNotice notice={arrivalNotice} />
                  <div className={FORM_CARD_CLASS}>
                    <h3 className="text-sm font-semibold text-foreground">Shipment Basics</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Enter core details for this inbound shipment.</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('shipmentNo')}</label>
                      <input
                        value={arrivalDraft.shipmentNumber}
                        onChange={(event) => updateArrivalDraft('shipmentNumber', event.target.value)}
                        type="text"
                        autoFocus
                        className={FORM_INPUT_CLASS}
                        placeholder="SHP-202X..."
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('supplier')}</label>
                      <input
                        value={arrivalDraft.supplierName}
                        onChange={(event) => updateArrivalDraft('supplierName', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="Supplier Name..."
                      />
                    </div>
                  </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <h3 className="text-sm font-semibold text-foreground">Vehicle And Invoice</h3>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('truck')}</label>
                      <input
                        value={arrivalDraft.truckLicensePlate}
                        onChange={(event) => updateArrivalDraft('truckLicensePlate', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="RJ 14 XY 0000"
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('driver')}</label>
                      <input
                        value={arrivalDraft.driverName}
                        onChange={(event) => updateArrivalDraft('driverName', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="Driver Name..."
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('invoiceNo')}</label>
                      <input
                        value={arrivalDraft.invoiceNumber}
                        onChange={(event) => updateArrivalDraft('invoiceNumber', event.target.value)}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        placeholder="INV-..."
                      />
                    </div>
                    <AttachmentField
                      label="Invoice photo"
                      file={arrivalAttachments.purchaseInvoice}
                      onChange={(file) => setArrivalAttachments((current) => ({ ...current, purchaseInvoice: file }))}
                      hint="Purchase invoice photo or PDF."
                    />
                    <AttachmentField
                      label="Transporter bill photo"
                      file={arrivalAttachments.transporterBill}
                      onChange={(file) => setArrivalAttachments((current) => ({ ...current, transporterBill: file }))}
                      accept="image/*"
                      hint="Truck bill, lorry receipt, or transporter bill photo."
                    />
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('transportCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={arrivalDraft.transportCost}
                          onChange={(event) => updateArrivalDraft('transportCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={FORM_LABEL_CLASS}>{t('laborCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={arrivalDraft.laborCost}
                          onChange={(event) => updateArrivalDraft('laborCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
                    <div className="flex justify-between items-center mb-2 gap-4">
                      <label className="text-sm font-semibold text-foreground">{t('items')}</label>
                      <button
                        type="button"
                        onClick={addArrivalItemRow}
                        className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
                      >
                        {t('addItem')}
                      </button>
                    </div>
                    <datalist id="arrival-item-options">
                      {(data?.activeItems || []).map((stockItem) => (
                        <option key={`arrival-option-${stockItem.id}`} value={stockItem.name}>
                          {stockItem.sku}
                        </option>
                      ))}
                    </datalist>
                    <div className="space-y-3">
                      {arrivalDraft.items.map((item, index) => (
                        <div key={`arrival-item-${index}`} className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
                          <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
                            <span>Item {index + 1}</span>
                            <span className={`rounded-full border px-2.5 py-1 ${item.itemId ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                              {item.itemId ? 'Autofilled from catalog' : 'New tile entry'}
                            </span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="col-span-2">
                              <input
                                value={item.itemName}
                                onChange={(event) => handleArrivalItemNameChange(index, event.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="Type tile name (autocomplete will auto-fill if found)"
                                list="arrival-item-options"
                              />
                              <div className="mt-1 text-[11px] text-muted-foreground">If this matches an existing tile, details auto-fill. Otherwise fill details below for new tile entry.</div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Whole(Box)</label>
                              <input
                                value={item.wholeQty}
                                onChange={(event) => updateArrivalItem(index, 'wholeQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Broken tiles</label>
                              <input
                                value={item.brokenQty}
                                onChange={(event) => updateArrivalItem(index, 'brokenQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <input
                              value={item.brandName}
                              onChange={(event) => updateArrivalItem(index, 'brandName', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Brand"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.typeName}
                              onChange={(event) => updateArrivalItem(index, 'typeName', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Type"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sizeLabel}
                              onChange={(event) => updateArrivalItem(index, 'sizeLabel', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Size"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sku}
                              onChange={(event) => handleArrivalItemSkuChange(index, event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="SKU optional"
                            />
                            <input
                              value={item.tilesPerBox}
                              onChange={(event) => updateArrivalItem(index, 'tilesPerBox', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Tiles / box"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.piecesPerBox}
                              onChange={(event) => updateArrivalItem(index, 'piecesPerBox', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Pieces / box"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.reorderLevel}
                              onChange={(event) => updateArrivalItem(index, 'reorderLevel', event.target.value)}
                              type="number"
                              min="0"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Reorder level"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.sizeUnit}
                              onChange={(event) => updateArrivalItem(index, 'sizeUnit', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder="Size unit"
                              disabled={Boolean(item.itemId)}
                            />
                            <input
                              value={item.description}
                              onChange={(event) => updateArrivalItem(index, 'description', event.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 lg:col-span-2"
                              placeholder="Description"
                              disabled={Boolean(item.itemId)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={FORM_CARD_CLASS}>
                    <label className={FORM_LABEL_CLASS}>{t('notes')}</label>
                    <textarea
                      value={arrivalDraft.notes}
                      onChange={(event) => updateArrivalDraft('notes', event.target.value)}
                      className={FORM_INPUT_CLASS}
                      rows="2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={arrivalSubmitting}
                    className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {arrivalSubmitting ? 'Submitting...' : t('submitArrival')}
                  </button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
          {!canCreateArrival ? (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Insufficient permission: salespeople can create dispatches but cannot create arrivals.
            </div>
          ) : null}
          <div className="border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <input
              type="search"
              value={arrivalSearch}
              onChange={(event) => setArrivalSearch(event.target.value)}
              placeholder="Search arrivals by date, product, qty, truck, or status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'datetime')} className="font-medium hover:text-foreground">
                      Datetime
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'shipment')} className="font-medium hover:text-foreground">
                      {t('shipmentNo')}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'products')} className="font-medium hover:text-foreground">
                      Products
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'quantities')} className="font-medium hover:text-foreground">
                      Quantities
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'status')} className="font-medium hover:text-foreground">
                      {t('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2">Generated By</th>
                  <th className="px-3 py-2">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {arrivalPagination.rows.map((a) => (
                  <tr
                    key={a.id}
                    className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${
                      highlightedShipmentKey === `arrival-${a.id}` ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'
                    }`}
                    onClick={() => openShipmentPreview('arrival', a)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openShipmentPreview('arrival', a);
                      }
                    }}
                    title="Click to preview"
                  >
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(a.arrival_date || a.created_at)}</td>
                    <td className="px-3 py-2 font-mono font-medium text-primary">{a.shipment_number}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-[260px] truncate" title={a.product_names || a.product_skus || ''}>
                        {a.product_names || a.product_skus || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken
                    </td>
                    <td className="px-3 py-2"><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{a.generated_by || '—'}</span>
                        <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(a.generated_by_role)}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.approved_by || '—'}</td>
                  </tr>
                ))}
                {arrivalPagination.total === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-3 py-10">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <PackageCheck className="h-6 w-6 text-slate-400" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">No arrivals logged yet.</p>
                        <button
                          type="button"
                          onClick={() => setArrivalSearch('')}
                          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={arrivalPagination.page}
            pageCount={arrivalPagination.pageCount}
            total={arrivalPagination.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setArrivalPage}
          />
        </section>
        </div>
        )}

        {activeTableView === 'dispatches' && (
        <div className="stock-tab-panel" key="stock-panel-dispatches">
        <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-base font-semibold text-foreground">{t('dispatches')}</h2>
              <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDispatchNotice(null)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  + {t('newDispatch')}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-none overflow-y-auto md:w-[50vw]">
                <SheetHeader>
                  <SheetTitle>{t('logNewDispatch')}</SheetTitle>
                  <SheetDescription>{t('logNewDispatchDesc')}</SheetDescription>
                </SheetHeader>
                <form className="mt-6 space-y-4" onSubmit={handleDispatchSubmit}>
                  <InlineNotice notice={dispatchNotice} />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('dispatchNo')}</label>
                      <input
                        value={dispatchDraft.shipmentNumber}
                        onChange={(event) => updateDispatchDraft('shipmentNumber', event.target.value)}
                        type="text"
                        autoFocus
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="DSP-202X..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('customer')}</label>
                      <input
                        value={dispatchDraft.customerName}
                        onChange={(event) => updateDispatchDraft('customerName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Customer Name..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('truck')}</label>
                      <input
                        value={dispatchDraft.truckLicensePlate}
                        onChange={(event) => updateDispatchDraft('truckLicensePlate', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="RJ 14 XY 0000"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('driver')}</label>
                      <input
                        value={dispatchDraft.driverName}
                        onChange={(event) => updateDispatchDraft('driverName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Driver Name..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('invoiceNo')}</label>
                      <input
                        value={dispatchDraft.invoiceNumber}
                        onChange={(event) => updateDispatchDraft('invoiceNumber', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="INV-..."
                      />
                    </div>
                    <AttachmentField
                      label="Sales invoice photo"
                      file={dispatchAttachments.salesInvoice}
                      onChange={(file) => setDispatchAttachments((current) => ({ ...current, salesInvoice: file }))}
                      hint="Sales invoice photo or PDF."
                    />
                    <AttachmentField
                      label="Gatepass photo"
                      file={dispatchAttachments.gatepass}
                      onChange={(file) => setDispatchAttachments((current) => ({ ...current, gatepass: file }))}
                      accept="image/*"
                      hint="Gatepass photo before dispatch leaves the yard."
                    />
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('salesperson')}</label>
                      <input
                        value={dispatchDraft.salespersonName}
                        onChange={(event) => updateDispatchDraft('salespersonName', event.target.value)}
                        type="text"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Salesperson..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('transportCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={dispatchDraft.transportCost}
                          onChange={(event) => updateDispatchDraft('transportCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background pl-12 pr-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/80">{t('laborCost')}</label>
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                        <input
                          value={dispatchDraft.laborCost}
                          onChange={(event) => updateDispatchDraft('laborCost', event.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border border-border bg-background pl-12 pr-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Amount in INR.</p>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-2 gap-4">
                      <label className="text-sm font-semibold text-foreground">{t('items')}</label>
                      <button
                        type="button"
                        onClick={addDispatchItemRow}
                        className="text-primary text-xs font-semibold hover:underline"
                      >
                        {t('addItem')}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 items-center mb-2">
                      <div className="col-span-2 text-xs font-semibold text-muted-foreground">{t('sku')} / {t('name')}</div>
                      <div className="text-xs font-semibold text-muted-foreground">{t('whole')}</div>
                      <div className="text-xs font-semibold text-muted-foreground">{t('broken')}</div>
                    </div>
                    <div className="space-y-3">
                      {dispatchDraft.items.map((item, index) => (
                        <div key={`dispatch-item-${index}`} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted-foreground">
                            <span>Item {index + 1}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 items-center">
                            <div className="col-span-2">
                              <select
                                value={item.itemId}
                                onChange={(event) => updateDispatchItem(index, 'itemId', event.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              >
                                <option value="">{t('selectItem')}</option>
                                {data?.activeItems?.map((stockItem) => (
                                  <option key={stockItem.id} value={stockItem.id}>
                                    {stockItem.sku} - {stockItem.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <input
                                value={item.loadedWholeQty}
                                onChange={(event) => updateDispatchItem(index, 'loadedWholeQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <input
                                value={item.loadedBrokenQty}
                                onChange={(event) => updateDispatchItem(index, 'loadedBrokenQty', event.target.value)}
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/80">{t('notes')}</label>
                    <textarea
                      value={dispatchDraft.notes}
                      onChange={(event) => updateDispatchDraft('notes', event.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      rows="2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={dispatchSubmitting}
                    className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {dispatchSubmitting ? 'Submitting...' : t('submitDispatch')}
                  </button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
          <div className="border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <input
              type="search"
              value={dispatchSearch}
              onChange={(event) => setDispatchSearch(event.target.value)}
              placeholder="Search dispatches by date, product, qty, truck, or status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'datetime')} className="font-medium hover:text-foreground">
                      Datetime
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'shipment')} className="font-medium hover:text-foreground">
                      {t('dispatchNo')}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'products')} className="font-medium hover:text-foreground">
                      Products
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'quantities')} className="font-medium hover:text-foreground">
                      Quantities
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'status')} className="font-medium hover:text-foreground">
                      {t('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2">Generated By</th>
                  <th className="px-3 py-2">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dispatchPagination.rows.map((d) => (
                  <tr
                    key={d.id}
                    className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${
                      highlightedShipmentKey === `dispatch-${d.id}` ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'
                    }`}
                    onClick={() => openShipmentPreview('dispatch', d)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openShipmentPreview('dispatch', d);
                      }
                    }}
                    title="Click to preview"
                  >
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(d.dispatch_date || d.created_at)}</td>
                    <td className="px-3 py-2 font-mono font-medium text-primary">{d.shipment_number}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-[260px] truncate" title={d.product_names || d.product_skus || ''}>
                        {d.product_names || d.product_skus || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken
                    </td>
                    <td className="px-3 py-2"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{d.generated_by || '—'}</span>
                        <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(d.generated_by_role)}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.approved_by || '—'}</td>
                  </tr>
                ))}
                {dispatchPagination.total === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-3 py-10">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <PackageCheck className="h-6 w-6 text-slate-400" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">No dispatches logged yet.</p>
                        <button
                          type="button"
                          onClick={() => setDispatchSearch('')}
                          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={dispatchPagination.page}
            pageCount={dispatchPagination.pageCount}
            total={dispatchPagination.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setDispatchPage}
          />
        </section>
        </div>
        )}

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">Loading preview…</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'stock'
            ? [
                {
                  title: 'Item Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'SKU', value: previewState.record?.sku },
                        { label: 'Name', value: previewState.record?.name },
                        { label: 'Size', value: previewState.record?.size_label },
                        { label: 'Whole Qty', value: previewState.record?.current_whole_qty },
                        { label: 'Broken Qty', value: previewState.record?.current_broken_qty },
                        { label: 'Reorder Level', value: previewState.record?.reorder_level },
                        { label: 'Tiles / Box', value: previewState.record?.tiles_per_box },
                      ]}
                    />
                  ),
                },
              ]
            : [
                {
                  title: 'Shipment Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate || previewState.record?.truck_number },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Invoice No.', value: previewState.record?.invoice_number },
                        { label: 'Gatepass No.', value: previewState.record?.gatepass_number },
                        { label: 'Customer / Supplier', value: previewState.record?.customer_name || previewState.record?.supplier_name },
                        { label: 'Total Whole', value: previewState.record?.total_whole_qty },
                        { label: 'Total Broken', value: previewState.record?.total_broken_qty },
                        { label: 'Notes', value: previewState.record?.notes },
                      ]}
                    />
                  ),
                },
                previewState.items?.length
                  ? {
                      title: 'Line Items',
                      children: (
                        <>
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-muted/70 text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2 text-right">Whole</th>
                                  <th className="px-3 py-2 text-right">Broken</th>
                                  <th className="px-3 py-2">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.notes || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationControls
                            page={previewItemPagination.page}
                            pageCount={previewItemPagination.pageCount}
                            total={previewItemPagination.total}
                            pageSize={DEFAULT_PAGE_SIZE}
                            onPageChange={setPreviewItemsPage}
                          />
                        </>
                      ),
                    }
                  : null,
                previewState.documents?.length
                  ? {
                      title: 'Linked Documents',
                      children: (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {previewState.documents.map((document) => (
                            <section
                              key={document.id}
                              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                            >
                                <div className="border-b border-border bg-muted/40 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                                  <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                                  <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                              </div>
                              <div className="p-4">
                                {renderDocumentPreview(document)}
                              </div>
                            </section>
                          ))}
                        </div>
                      ),
                    }
                  : null,
              ]
        }
      />

      
    </div>
  );
}

```


---
### FILE: ./app/stock/admin/page.js
```javascript
'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { useEffect, useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useSearchParams } from 'next/navigation';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';
import { validateStockPassword } from '@/lib/auth0-management';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, ChevronDown, Eye, EyeOff, PackageSearch, ShieldAlert, UsersRound } from 'lucide-react';

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatChartDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';
const FORM_SELECT_CLASS = `${FORM_INPUT_CLASS} appearance-none pr-10`;
const FORM_PANEL_CLASS = 'rounded-2xl border border-border/80 bg-background/80 p-4';

const CLASSES = {
  heroGrid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6',
  heroCard: 'rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-900',
  heroLabel: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  heroValue: 'mt-2 text-3xl font-bold text-slate-900 dark:text-white',
  heroBadgeBase: 'text-[10px] px-2 py-0.5 rounded-full font-semibold',
  sectionCard: 'rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
  sectionHeader: 'flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800',
  avatar: 'h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-xs',
  actionButton: 'active:scale-95 transition-transform',
};

function getInitials(name, email) {
  const source = (name || email || '').trim();
  if (!source) {
    return 'NA';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getUserRoleBadgeClass(role) {
  if (role === 'admin') {
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }

  if (role === 'salesperson' || role === 'sales') {
    return 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300';
  }

  if (role === 'stock_maintainer' || role === 'manager') {
    return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized.includes('active') || normalized.includes('complete')) {
    return 'approved';
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('warning')) {
    return 'pending';
  }
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('critical')) {
    return 'rejected';
  }
  return 'neutral';
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const t = (key) => getTranslation(`stock.admin.${key}`, language);
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [mobileSection, setMobileSection] = useState('approvals');
  const [showPrimaryPassword, setShowPrimaryPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userFormNotice, setUserFormNotice] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [changeRequestPage, setChangeRequestPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [changeRequests, setChangeRequests] = useState([]);
  const [highlightedChangeRequestId, setHighlightedChangeRequestId] = useState(null);
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'stock_maintainer',
    department: '',
    status: 'active',
  });

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [dashboardResponse, analyticsResponse, changeRequestResponse] = await Promise.all([
          fetch('/api/stock/admin/dashboard'),
          fetch('/api/stock/dashboard'),
          fetch('/api/stock/change-requests', { cache: 'no-store' }),
        ]);

        const dashboardJson = await dashboardResponse.json();
        const analyticsJson = await analyticsResponse.json();
        const changeRequestJson = await changeRequestResponse.json();

        if (!dashboardResponse.ok) {
          throw new Error(dashboardJson.error || 'Fetch failed');
        }

        if (!analyticsResponse.ok) {
          throw new Error(analyticsJson.error || 'Failed to load analytics');
        }

        if (!changeRequestResponse.ok) {
          throw new Error(changeRequestJson.error || 'Failed to load change requests');
        }

        if (mounted) {
          setData(dashboardJson);
          setAnalyticsData(analyticsJson);
          setChangeRequests(changeRequestJson.requests || []);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user) loadData();
    return () => { mounted = false; };
  }, [user]);

  async function handleShipmentAction(type, id, action, notes = null) {
    const confirmMessage = action === 'reject'
      ? 'Are you sure you want to reject this shipment?'
      : null;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setActionLoading(`${type}-${id}-${action}`);
    setActionNotice(null);
    try {
      const response = await fetch(`/api/stock/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes,
          reason: action === 'request_changes' ? notes : undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to update shipment');
      }

      if (action === 'approve') {
        if (json?.idempotent) {
          setActionNotice({ type: 'success', message: 'Already approved; no duplicate stock movement applied' });
        } else {
          setActionNotice({ type: 'success', message: 'Shipment approved successfully.' });
        }
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshDashboard() {
    const [refreshResponse, analyticsResponse, changeRequestResponse] = await Promise.all([
      fetch('/api/stock/admin/dashboard'),
      fetch('/api/stock/dashboard'),
      fetch('/api/stock/change-requests', { cache: 'no-store' }),
    ]);

    const refreshJson = await refreshResponse.json();
    const analyticsJson = await analyticsResponse.json();
    const changeRequestJson = await changeRequestResponse.json();

    if (!refreshResponse.ok) {
      throw new Error(refreshJson.error || 'Failed to refresh dashboard');
    }

    if (!analyticsResponse.ok) {
      throw new Error(analyticsJson.error || 'Failed to refresh analytics');
    }

    if (!changeRequestResponse.ok) {
      throw new Error(changeRequestJson.error || 'Failed to refresh change requests');
    }

    setData(refreshJson);
    setAnalyticsData(analyticsJson);
    setChangeRequests(changeRequestJson.requests || []);
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading approval detail…',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      if (!documentsResponse.ok) throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound shipment detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Arrival' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full shipment details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  function openUserPreview(row) {
    setPreviewState({
      open: true,
      loading: false,
      kind: 'user',
      title: row.full_name || row.email || 'User',
      description: 'User contact and access details',
      record: row,
      items: [],
      documents: [],
      error: null,
    });
  }

  function openChangeRequestPreview(row) {
    setPreviewState({
      open: true,
      loading: false,
      kind: 'change-request',
      title: row.request_number || `Change Request #${row.id}`,
      description: 'Change request details and lifecycle context',
      record: row,
      items: [],
      documents: [],
      error: null,
    });
  }

  async function handleSaveUser(event) {
    event.preventDefault();

    setUserFormNotice(null);
    setError(null);

    if (!userDraft.name.trim() || !userDraft.phone.trim()) {
      setUserFormNotice({ type: 'error', message: 'Name and phone are required.' });
      return;
    }

    if (!userDraft.email.trim()) {
      setUserFormNotice({ type: 'error', message: 'Email is required.' });
      return;
    }

    const passwordError = validateStockPassword(userDraft.password);
    if (passwordError) {
      setUserFormNotice({ type: 'error', message: passwordError });
      return;
    }

    if (userDraft.password !== confirmPassword) {
      setUserFormNotice({ type: 'error', message: 'Password and confirm password do not match.' });
      return;
    }

    setActionLoading('user-save');
    setError(null);

    try {
      const response = await fetch('/api/stock/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDraft),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to save user');
      }

      setUserDraft({ name: '', phone: '', email: '', password: '', role: 'stock_maintainer', department: '', status: 'active' });
      setConfirmPassword('');
      setShowPrimaryPassword(false);
      setShowConfirmPassword(false);
      setUserFormNotice(null);
      setShowUserForm(false);
      await refreshDashboard();
    } catch (err) {
      setUserFormNotice({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Deactivate this user?')) {
      return;
    }

    setActionLoading(`user-${id}-delete`);
    setError(null);

    try {
      const response = await fetch(`/api/stock/users?id=${id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to remove user');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const arrivalPagination = paginateRows(data?.pendingArrivals || [], arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(data?.pendingDispatches || [], dispatchPage, DEFAULT_PAGE_SIZE);
  const changeRequestPagination = paginateRows(changeRequests || [], changeRequestPage, DEFAULT_PAGE_SIZE);
  const userPagination = paginateRows(data?.users || [], userPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setChangeRequestPage((current) => Math.min(current, changeRequestPagination.pageCount));
  }, [changeRequestPagination.pageCount]);

  useEffect(() => {
    setUserPage((current) => Math.min(current, userPagination.pageCount));
  }, [userPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  useEffect(() => {
    const focus = searchParams.get('focus');
    const requestIdRaw = searchParams.get('requestId');
    const requestId = Number(requestIdRaw);

    if (focus !== 'change-requests' || !requestId || Number.isNaN(requestId)) {
      return;
    }

    const deepLinkKey = `change-requests:${requestId}`;
    if (processedDeepLink === deepLinkKey) {
      return;
    }

    const target = (changeRequests || []).find((requestRow) => Number(requestRow.id) === requestId);
    if (!target) {
      return;
    }

    setHighlightedChangeRequestId(requestId);
    setMobileSection('changes');
    openChangeRequestPreview(target);
    setProcessedDeepLink(deepLinkKey);

    const panel = document.getElementById('change-requests-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams, changeRequests, processedDeepLink]);

  useEffect(() => {
    if (!highlightedChangeRequestId) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHighlightedChangeRequestId(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [highlightedChangeRequestId]);

  const pendingReviews = Number(analyticsData?.summary?.pending_inbound_reviews || 0) + Number(analyticsData?.summary?.pending_outbound_reviews || 0);
  const totalIncoming = Number(analyticsData?.summary?.total_incoming || 0);
  const totalOutgoing = Number(analyticsData?.summary?.total_outgoing || 0);
  const totalUsers = Number(data?.users?.length || 0);
  const activeUsers = (data?.users || []).filter((entry) => Boolean(entry?.is_active)).length;
  const pendingUsers = Math.max(totalUsers - activeUsers, 0);

  const summaryTiles = [
    {
      label: 'Team Accounts',
      value: totalUsers,
      href: '/stock?view=items',
      icon: UsersRound,
      trend: activeUsers - pendingUsers,
      subMetrics: [
        { label: 'Active', value: activeUsers },
        { label: 'Pending', value: pendingUsers },
      ],
    },
    {
      label: 'Approval Queue',
      value: pendingReviews,
      href: '#approval-queue',
      icon: ShieldAlert,
      trend: pendingReviews > 0 ? -pendingReviews : 1,
      subMetrics: [
        { label: 'Inbound', value: Number(analyticsData?.summary?.pending_inbound_reviews || 0) },
        { label: 'Outbound', value: Number(analyticsData?.summary?.pending_outbound_reviews || 0) },
      ],
    },
    {
      label: 'Stored Units',
      value: Number(analyticsData?.summary?.total_whole_stored || 0) + Number(analyticsData?.summary?.total_broken_stored || 0),
      href: '/stock?view=items',
      icon: PackageSearch,
      trend: Number(analyticsData?.summary?.total_whole_stored || 0) - Number(analyticsData?.summary?.total_broken_stored || 0),
      subMetrics: [
        { label: 'Whole', value: Number(analyticsData?.summary?.total_whole_stored || 0) },
        { label: 'Broken', value: Number(analyticsData?.summary?.total_broken_stored || 0) },
      ],
    },
    {
      label: 'Net Movement',
      value: totalIncoming - totalOutgoing,
      href: '/stock?view=arrivals',
      icon: ArrowRightLeft,
      trend: totalIncoming - totalOutgoing,
      subMetrics: [
        { label: 'Incoming', value: totalIncoming },
        { label: 'Outgoing', value: totalOutgoing },
      ],
    },
  ];

  const movementByDate = new Map();

  (analyticsData?.recentArrivals || []).forEach((shipment) => {
    const dateSource = shipment.arrival_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.inbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  (analyticsData?.recentDispatches || []).forEach((shipment) => {
    const dateSource = shipment.dispatch_date || shipment.created_at;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const dateKey = date.toISOString().slice(0, 10);
    const current = movementByDate.get(dateKey) || { inbound: 0, outbound: 0, date: dateKey };
    current.outbound += Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0);
    movementByDate.set(dateKey, current);
  });

  const movementTrend = Array.from(movementByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);

  const chartWidth = 700;
  const chartHeight = 240;
  const chartPadding = { top: 18, right: 16, bottom: 34, left: 48 };
  const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const maxChartValue = Math.max(
    ...movementTrend.map((point) => Math.max(point.inbound, point.outbound)),
    1
  );

  function pointX(index) {
    if (movementTrend.length <= 1) {
      return chartPadding.left + chartInnerWidth / 2;
    }

    return chartPadding.left + (index / (movementTrend.length - 1)) * chartInnerWidth;
  }

  function pointY(value) {
    return chartPadding.top + chartInnerHeight - (value / maxChartValue) * chartInnerHeight;
  }

  function linePath(key) {
    if (!movementTrend.length) {
      return '';
    }

    return movementTrend
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${pointX(index)} ${pointY(point[key])}`)
      .join(' ');
  }

  const inboundPath = linePath('inbound');
  const outboundPath = linePath('outbound');

  const lowStockCount = (analyticsData?.activeItems || []).filter((item) => {
    const available = Number(item.current_whole_qty || 0) + Number(item.current_broken_qty || 0);
    const reorder = Number(item.reorder_level || 0);
    return reorder > 0 && available <= reorder;
  }).length;

  const totalStored = Number(analyticsData?.summary?.total_whole_stored || 0) + Number(analyticsData?.summary?.total_broken_stored || 0);
  const brokenRatio = totalStored > 0 ? Number(analyticsData?.summary?.total_broken_stored || 0) / totalStored : 0;
  const latestTrendPoint = movementTrend[movementTrend.length - 1] || null;

  const operationalAlerts = [
    pendingReviews > 0
      ? {
          level: 'critical',
          title: 'Pending approvals need action',
          message: `${pendingReviews} shipment${pendingReviews > 1 ? 's' : ''} waiting in review queue.`,
          href: '#approval-queue',
        }
      : null,
    lowStockCount > 0
      ? {
          level: 'warning',
          title: 'Low stock risk detected',
          message: `${lowStockCount} item${lowStockCount > 1 ? 's are' : ' is'} at or below reorder level.`,
          href: '/stock?view=items',
        }
      : null,
    brokenRatio >= 0.08
      ? {
          level: 'warning',
          title: 'Broken stock ratio is high',
          message: `${(brokenRatio * 100).toFixed(1)}% of stock is marked broken. Investigate damage sources.`,
          href: '/stock?view=items',
        }
      : null,
    latestTrendPoint && latestTrendPoint.outbound > latestTrendPoint.inbound
      ? {
          level: 'info',
          title: 'Outflow is above inflow today',
          message: `Outgoing ${latestTrendPoint.outbound} vs incoming ${latestTrendPoint.inbound} on latest trend day.`,
          href: '/stock?view=dispatches',
        }
      : null,
  ].filter(Boolean);

  const recentActivity = [
    ...(analyticsData?.recentArrivals || []).map((shipment) => ({
      id: `arrival-${shipment.id}`,
      kind: 'arrival',
      title: `Arrival ${shipment.shipment_number}`,
      subtitle: `${Number(shipment.total_whole_qty || 0)} whole + ${Number(shipment.total_broken_qty || 0)} broken`,
      by: shipment.generated_by || '—',
      at: shipment.arrival_date || shipment.created_at,
      status: shipment.approval_status || shipment.status,
      href: `/stock?view=arrivals&entityType=inbound_shipment&entityId=${shipment.id}`,
    })),
    ...(analyticsData?.recentDispatches || []).map((shipment) => ({
      id: `dispatch-${shipment.id}`,
      kind: 'dispatch',
      title: `Dispatch ${shipment.shipment_number}`,
      subtitle: `${Number(shipment.total_whole_qty || 0)} whole + ${Number(shipment.total_broken_qty || 0)} broken`,
      by: shipment.generated_by || '—',
      at: shipment.dispatch_date || shipment.created_at,
      status: shipment.approval_status || shipment.status,
      href: `/stock?view=dispatches&entityType=outbound_shipment&entityId=${shipment.id}`,
    })),
  ]
    .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime())
    .slice(0, 8);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className={CLASSES.heroGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`hero-skeleton-${index}`} className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-32" />
          ))}
        </div>
        <div className="animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 h-64" />
      </div>
    );
  }
  if (!data && error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 lg:space-y-6">
      <h1 className="text-xl font-bold text-foreground lg:text-2xl">{t('adminTitle')}</h1>

      {actionNotice ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            actionNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {actionNotice.message}
        </div>
      ) : null}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-1">
        <div className={CLASSES.heroGrid}>
          {summaryTiles.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className={`${CLASSES.heroCard} ${CLASSES.actionButton}`}
            >
              <div className="flex items-start justify-between">
                <p className={CLASSES.heroLabel}>{stat.label}</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <stat.icon className="h-4 w-4" />
                </span>
              </div>
              <p className={`${CLASSES.heroValue} font-mono`}>{stat.value}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                {stat.subMetrics.map((item) => (
                  <span key={`${stat.label}-${item.label}`} className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{item.label}</span>
                    <span className="font-mono text-slate-700 dark:text-slate-200">{item.value}</span>
                  </span>
                ))}
                <span className={`${CLASSES.heroBadgeBase} ${stat.trend > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'}`}>
                  {stat.trend > 0 ? 'Up' : 'Down'}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">Movement Trend</h2>
              <p className="text-xs text-muted-foreground">Quantity vs Date for recent arrivals and dispatches</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Incoming</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Outgoing</span>
            </div>
          </div>
          {movementTrend.length ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full rounded-xl border border-border bg-muted/20 sm:h-56">
              {[0, 0.5, 1].map((tick) => {
                const value = Math.round(maxChartValue * tick);
                const y = pointY(value);

                return (
                  <g key={`grid-${tick}`}>
                    <line
                      x1={chartPadding.left}
                      y1={y}
                      x2={chartWidth - chartPadding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-border"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={chartPadding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              <path d={inboundPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <path d={outboundPath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

              {movementTrend.map((point, index) => (
                <g key={`dots-${point.date}`}>
                  <circle cx={pointX(index)} cy={pointY(point.inbound)} r="3.5" fill="#10b981" />
                  <circle cx={pointX(index)} cy={pointY(point.outbound)} r="3.5" fill="#8b5cf6" />
                  <text
                    x={pointX(index)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {formatChartDate(point.date)}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              No movement data available yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Operational Alerts</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {operationalAlerts.length || 0} active
            </span>
          </div>
          {operationalAlerts.length ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {operationalAlerts.map((alert) => (
                <Link
                  key={alert.title}
                  href={alert.href}
                  className={`block rounded-xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-sm ${
                    alert.level === 'critical'
                      ? 'border-rose-200 bg-rose-50/80 text-rose-800'
                      : alert.level === 'warning'
                        ? 'border-amber-200 bg-amber-50/80 text-amber-800'
                        : 'border-sky-200 bg-sky-50/80 text-sky-800'
                  }`}
                >
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-80">{alert.message}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 px-3 py-4 text-sm text-emerald-700">
              All clear. No critical alerts right now.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
            <span className="text-xs text-muted-foreground">Live operations snapshot</span>
          </div>
          {recentActivity.length ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {recentActivity.map((event) => (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{event.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">By {event.by} • {formatDateTime(event.at)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${event.kind === 'arrival' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                    {event.status || event.kind}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No activity recorded yet.
            </div>
          )}
        </div>
      </div>

      <div className="lg:hidden rounded-xl border border-border bg-card/80 p-1 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {[{ id: 'approvals', label: 'Approvals' }, { id: 'changes', label: 'Changes' }, { id: 'users', label: 'Users' }].map((tab) => {
            const isActive = mobileSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileSection(tab.id)}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden rounded-xl border border-border bg-card/80 p-1 shadow-sm lg:block">
        <div className="grid grid-cols-3 gap-1">
          {[{ id: 'approvals', label: 'Approvals' }, { id: 'changes', label: 'Changes' }, { id: 'users', label: 'Users' }].map((tab) => {
            const isActive = mobileSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileSection(tab.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div id="approval-queue" className={`space-y-4 ${mobileSection === 'approvals' ? '' : 'hidden'}`}>
          <div className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{t('pendingArrivals')}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('shipmentNo')}</th>
                    <th className="px-3 py-2">Maintainer</th>
                    <th className="px-3 py-2">{t('truck')}</th>
                    <th className="px-3 py-2">{t('driver')}</th>
                    <th className="px-3 py-2">{t('boxesQty')}</th>
                    <th className="px-3 py-2">{t('brokenQty')}</th>
                    <th className="px-3 py-2 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {arrivalPagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                      onClick={() => openShipmentPreview('arrival', item)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('arrival', item);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-mono font-medium text-primary">{item.shipment_number}</td>
                      <td className="px-3 py-2 text-foreground/80">{item.maintainer_name || '-'}</td>
                      <td className="px-3 py-2">{item.truck_license_plate}</td>
                      <td className="px-3 py-2">{item.driver_name}</td>
                      <td className="px-3 py-2">{item.total_whole_qty}</td>
                      <td className="px-3 py-2">{item.total_broken_qty}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('inbound-shipments', item.id, 'approve');
                          }}
                          disabled={actionLoading === `inbound-shipments-${item.id}-approve`}
                          className="mr-2 rounded bg-green-50 px-2 py-1 text-green-600 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Approve"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('inbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                          }}
                          disabled={actionLoading === `inbound-shipments-${item.id}-reject`}
                          className="rounded bg-red-50 px-2 py-1 text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Reject"
                        >
                          ✗
                        </button>
                      </td>
                    </tr>
                  ))}
                  {arrivalPagination.total === 0 && (
                    <tr><td colSpan="8" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={arrivalPagination.page}
              pageCount={arrivalPagination.pageCount}
              total={arrivalPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setArrivalPage}
            />
          </div>

          <div className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">{t('pendingDispatches')}</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('dispatchNo')}</th>
                    <th className="px-3 py-2">{t('truck')}</th>
                    <th className="px-3 py-2">{t('driver')}</th>
                    <th className="px-3 py-2">{t('boxesQty')}</th>
                    <th className="px-3 py-2">{t('brokenQty')}</th>
                    <th className="px-3 py-2 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dispatchPagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                      onClick={() => openShipmentPreview('dispatch', item)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('dispatch', item);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-mono font-medium text-primary">{item.shipment_number}</td>
                      <td className="px-3 py-2">{item.truck_license_plate}</td>
                      <td className="px-3 py-2">{item.driver_name}</td>
                      <td className="px-3 py-2">{item.total_whole_qty}</td>
                      <td className="px-3 py-2">{item.total_broken_qty}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('outbound-shipments', item.id, 'approve');
                          }}
                          disabled={actionLoading === `outbound-shipments-${item.id}-approve`}
                          className="mr-2 rounded bg-green-50 px-2 py-1 text-green-600 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Approve"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShipmentAction('outbound-shipments', item.id, 'reject', 'Rejected from admin hub');
                          }}
                          disabled={actionLoading === `outbound-shipments-${item.id}-reject`}
                          className="rounded bg-red-50 px-2 py-1 text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Reject"
                        >
                          ✗
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dispatchPagination.total === 0 && (
                    <tr><td colSpan="7" className="px-3 py-4 text-center text-muted-foreground">{t('noPending')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={dispatchPagination.page}
              pageCount={dispatchPagination.pageCount}
              total={dispatchPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setDispatchPage}
            />
          </div>
        </div>

        <div className={`space-y-4 ${mobileSection === 'changes' ? '' : 'hidden'}`}>
          <div id="change-requests-panel" className="flex h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold text-foreground">Change Requests</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Request No</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Requested By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {changeRequestPagination.rows.map((requestRow) => (
                    <tr
                      key={requestRow.id}
                      className={`cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5 ${
                        highlightedChangeRequestId === requestRow.id ? 'bg-primary/10 ring-1 ring-primary/40' : ''
                      }`}
                      onClick={() => openChangeRequestPreview(requestRow)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openChangeRequestPreview(requestRow);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 font-mono font-medium text-primary">{requestRow.request_number || `CR-${requestRow.id}`}</td>
                      <td className="px-3 py-2 text-foreground/80">{requestRow.source_entity_type} #{requestRow.source_entity_id}</td>
                      <td className="px-3 py-2">{requestRow.request_type}</td>
                      <td className="px-3 py-2"><Badge variant={getStatusVariant(requestRow.status)}>{requestRow.status}</Badge></td>
                      <td className="px-3 py-2">{requestRow.priority || 'normal'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{requestRow.requested_by_name || '—'}</td>
                    </tr>
                  ))}
                  {changeRequestPagination.total === 0 && (
                    <tr><td colSpan="6" className="px-3 py-4 text-center text-muted-foreground">No change requests found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={changeRequestPagination.page}
              pageCount={changeRequestPagination.pageCount}
              total={changeRequestPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setChangeRequestPage}
            />
          </div>
        </div>
      </div>

      <div id="users-contacts" className={`${CLASSES.sectionCard} overflow-hidden ${mobileSection === 'users' ? '' : 'hidden'}`}>
        <div className={CLASSES.sectionHeader}>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('usersSalespersons')}</h2>
          <button
            type="button"
            onClick={() => setShowUserForm((current) => !current)}
            className={`${CLASSES.actionButton} rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600`}
          >
            {t('addUserContact')}
          </button>
        </div>
        {showUserForm && (
          <form onSubmit={handleSaveUser} className="space-y-4 border-b border-border bg-muted/20 p-4">
            {userFormNotice && (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  userFormNotice.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {userFormNotice.message}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={FORM_LABEL_CLASS}>{t('name')}</span>
                <input
                  value={userDraft.name}
                  onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  autoFocus
                  className={FORM_INPUT_CLASS}
                  placeholder="Full name"
                />
              </label>
              <label>
                <span className={FORM_LABEL_CLASS}>{t('phone')}</span>
                <input
                  value={userDraft.phone}
                  onChange={(event) => setUserDraft((current) => ({ ...current, phone: event.target.value }))}
                  className={FORM_INPUT_CLASS}
                  placeholder="10-digit phone"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={FORM_LABEL_CLASS}>{t('email')}</span>
                <input
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                  className={FORM_INPUT_CLASS}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                <span className={FORM_LABEL_CLASS}>{t('role')}</span>
                <div className="relative">
                  <select
                    value={userDraft.role}
                    onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                    className={FORM_SELECT_CLASS}
                  >
                    <option value="stock_maintainer">stock_maintainer</option>
                    <option value="salesperson">salesperson</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className={FORM_LABEL_CLASS}>Department</span>
                <input
                  value={userDraft.department}
                  onChange={(event) => setUserDraft((current) => ({ ...current, department: event.target.value }))}
                  className={FORM_INPUT_CLASS}
                  placeholder="General"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={FORM_PANEL_CLASS}>
                <span className={FORM_LABEL_CLASS}>Password</span>
                <div className="relative">
                  <input
                    type={showPrimaryPassword ? 'text' : 'password'}
                    value={userDraft.password}
                    onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                    className={`${FORM_INPUT_CLASS} pr-10`}
                    placeholder="12+ chars, 3 of 4 types"
                    minLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrimaryPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPrimaryPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPrimaryPassword}
                  >
                    {showPrimaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Use at least 12 characters and include 3 of 4 types: lowercase, uppercase, number, and symbol.</p>
              </label>
              <label className={FORM_PANEL_CLASS}>
                <span className={FORM_LABEL_CLASS}>Confirm Password</span>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={`${FORM_INPUT_CLASS} pr-10`}
                    placeholder="Re-enter password"
                    minLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={actionLoading === 'user-save'}
                className={`${CLASSES.actionButton} rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {actionLoading === 'user-save' ? 'Saving...' : 'Save User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserForm(false);
                  setUserFormNotice(null);
                  setConfirmPassword('');
                  setShowPrimaryPassword(false);
                  setShowConfirmPassword(false);
                }}
                className={`${CLASSES.actionButton} rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted`}
              >
                Cancel
              </button>
            </div>
            <input type="hidden" value={userDraft.status} readOnly />
          </form>
        )}
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/90 text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">User</th>
                <th className="px-6 py-3 font-semibold">Role</th>
                <th className="px-6 py-3 font-semibold">Department</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {userPagination.rows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  onClick={() => openUserPreview(u)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openUserPreview(u);
                    }
                  }}
                  title="Click to preview"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={CLASSES.avatar}>{getInitials(u.full_name, u.email)}</div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{u.full_name || 'N/A'}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">ID #{u.id} • {u.phone_number || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getUserRoleBadgeClass(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{u.department || 'General'}</td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {u.is_active ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
                      )}
                      {u.is_active ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openUserPreview(u);
                        }}
                        className={`${CLASSES.actionButton} rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteUser(u.id);
                        }}
                        disabled={actionLoading === `user-${u.id}-delete`}
                        className={`${CLASSES.actionButton} rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {userPagination.total === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={userPagination.page}
          pageCount={userPagination.pageCount}
          total={userPagination.total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setUserPage}
        />
      </div>

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">Loading preview…</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'change-request'
            ? [
                {
                  title: 'Change Request Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Request No.', value: previewState.record?.request_number },
                        { label: 'Source Type', value: previewState.record?.source_entity_type },
                        { label: 'Source ID', value: previewState.record?.source_entity_id },
                        { label: 'Request Type', value: previewState.record?.request_type },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Priority', value: previewState.record?.priority },
                        { label: 'Requested By', value: previewState.record?.requested_by_name },
                        { label: 'Reason', value: previewState.record?.reason },
                        { label: 'Created At', value: formatDateTime(previewState.record?.created_at) },
                        { label: 'Reviewed At', value: formatDateTime(previewState.record?.reviewed_at) },
                        { label: 'Approved At', value: formatDateTime(previewState.record?.approved_at) },
                        { label: 'Review Notes', value: previewState.record?.reviewed_notes },
                        { label: 'Approval Notes', value: previewState.record?.approval_notes },
                      ]}
                    />
                  ),
                },
              ]
            : previewState.kind === 'user'
            ? [
                {
                  title: 'User Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Full Name', value: previewState.record?.full_name },
                        { label: 'Email', value: previewState.record?.email },
                        { label: 'Phone', value: previewState.record?.phone_number },
                        { label: 'Role', value: previewState.record?.role },
                        { label: 'Department', value: previewState.record?.department || 'General' },
                        { label: 'Active', value: previewState.record?.is_active ? 'Yes' : 'No' },
                        { label: 'Auth0 Sub', value: previewState.record?.auth0_sub },
                        { label: 'Last Login', value: previewState.record?.last_login_at },
                      ]}
                    />
                  ),
                },
              ]
            : [
                {
                  title: 'Shipment Details',
                  children: (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Whole Qty', value: previewState.record?.total_whole_qty },
                        { label: 'Broken Qty', value: previewState.record?.total_broken_qty },
                      ]}
                    />
                  ),
                },
                previewState.items?.length
                  ? {
                      title: 'Line Items',
                      children: (
                        <>
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-muted/70 text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">Name</th>
                                  <th className="px-3 py-2 text-right">Whole</th>
                                  <th className="px-3 py-2 text-right">Broken</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {previewItemPagination.rows.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2 font-mono font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationControls
                            page={previewItemPagination.page}
                            pageCount={previewItemPagination.pageCount}
                            total={previewItemPagination.total}
                            pageSize={DEFAULT_PAGE_SIZE}
                            onPageChange={setPreviewItemsPage}
                          />
                        </>
                      ),
                    }
                  : null,
                previewState.documents?.length
                  ? {
                      title: 'Linked Documents',
                      children: (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {previewState.documents.map((document) => (
                            <a
                              key={document.id}
                              href={document.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-border bg-muted/30 p-3 transition hover:border-primary/30 hover:bg-primary/5"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                            </a>
                          ))}
                        </div>
                      ),
                    }
                  : null,
              ]
        }
      />
    </div>
  );
}

```


---
### FILE: ./app/stock/documents/page.js
```javascript
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import PaginationControls from '@/components/ui/pagination-controls';

const copy = {
  en: {
    title: 'Document Archive',
    subtitle: 'Upload and review shipment documents for arrivals and dispatches.',
    backToDashboard: 'Back to Dashboard',
    uploadTitle: 'Upload Document',
    documentType: 'Document Type',
    entityType: 'Entity Type',
    entityId: 'Entity ID',
    documentNumber: 'Document Number',
    notes: 'Notes',
    file: 'File',
    upload: 'Upload',
    loading: 'Loading documents...',
    empty: 'No documents found.',
    refresh: 'Refresh',
    recentDocuments: 'Recent Documents',
    outboundShipment: 'Outbound Shipment',
    inboundShipment: 'Inbound Shipment',
  },
  hi: {
    title: 'दस्तावेज़ संग्रह',
    subtitle: 'आगमन और डिस्पैच के शिपमेंट दस्तावेज़ अपलोड और देखें।',
    backToDashboard: 'डैशबोर्ड पर लौटें',
    uploadTitle: 'दस्तावेज़ अपलोड करें',
    documentType: 'दस्तावेज़ प्रकार',
    entityType: 'एंटिटी प्रकार',
    entityId: 'एंटिटी आईडी',
    documentNumber: 'दस्तावेज़ नंबर',
    notes: 'टिप्पणियाँ',
    file: 'फ़ाइल',
    upload: 'अपलोड',
    loading: 'दस्तावेज़ लोड हो रहे हैं...',
    empty: 'कोई दस्तावेज़ नहीं मिला।',
    refresh: 'रीफ्रेश',
    recentDocuments: 'हाल के दस्तावेज़',
    outboundShipment: 'जाने वाला शिपमेंट',
    inboundShipment: 'आने वाला शिपमेंट',
  },
};

const documentTypeOptions = [
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'transporter_bill', label: 'Transporter Bill' },
  { value: 'gatepass', label: 'Gatepass' },
  { value: 'sales_invoice', label: 'Sales Invoice' },
  { value: 'delivery_receipt', label: 'Delivery Receipt' },
  { value: 'customer_acknowledgement', label: 'Customer Acknowledgement' },
  { value: 'photo_evidence', label: 'Photo Evidence' },
  { value: 'other', label: 'Other' },
];

const entityTypeOptions = [
  { value: 'inbound_shipment', label: 'Inbound Shipment' },
  { value: 'outbound_shipment', label: 'Outbound Shipment' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'movement', label: 'Movement' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'other', label: 'Other' },
];

export default function StockDocumentsPage() {
  const { language } = useLanguage();
  const t = copy[language] || copy.en;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [documentPage, setDocumentPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    title: '',
    description: '',
    record: null,
  });
  const [form, setForm] = useState({
    documentType: 'purchase_invoice',
    entityType: 'inbound_shipment',
    entityId: '',
    documentNumber: '',
    notes: '',
    file: null,
  });

  const queryString = useMemo(() => new URLSearchParams({ limit: '100' }).toString(), []);

  useEffect(() => {
    let mounted = true;

    async function loadDocuments() {
      try {
        const response = await fetch(`/api/stock/documents?${queryString}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || 'Failed to load documents');
        }
        if (mounted) {
          setDocuments(json.documents || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      mounted = false;
    };
  }, [queryString]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.file || !form.entityId) {
      setError('File and Entity ID are required');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', form.file);
      formData.append('documentType', form.documentType);
      formData.append('entityType', form.entityType);
      formData.append('entityId', form.entityId);
      formData.append('documentNumber', form.documentNumber);
      formData.append('notes', form.notes);

      const response = await fetch('/api/stock/documents', {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to upload document');
      }

      setForm({
        documentType: 'purchase_invoice',
        entityType: 'inbound_shipment',
        entityId: '',
        documentNumber: '',
        notes: '',
        file: null,
      });
      await (async () => {
        const refreshResponse = await fetch(`/api/stock/documents?${queryString}`, { cache: 'no-store' });
        const refreshJson = await refreshResponse.json();
        if (!refreshResponse.ok) {
          throw new Error(refreshJson.error || 'Failed to refresh documents');
        }
        setDocuments(refreshJson.documents || []);
      })();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function openDocumentPreview(document) {
    setPreviewState({
      open: true,
      title: `${document.document_type || 'Document'} ${document.document_number || document.file_name || ''}`.trim(),
      description: 'Document preview and archive details',
      record: document,
    });
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  const documentPagination = paginateRows(documents, documentPage, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setDocumentPage((current) => Math.min(current, documentPagination.pageCount));
  }, [documentPagination.pageCount]);

  function renderDocumentPreview(document) {
    if (!document?.file_url) {
      return (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          No preview available.
        </div>
      );
    }

    if (document.mime_type?.startsWith('image/')) {
      return (
        <img
          src={document.file_url}
          alt={document.file_name || 'Document preview'}
          className="max-h-[70vh] w-full rounded-2xl border border-border object-contain bg-background/60"
        />
      );
    }

    return (
      <iframe
        src={document.file_url}
        title={document.file_name || 'Document preview'}
        className="h-[70vh] w-full rounded-2xl border border-border bg-card"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t.title}</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">{t.subtitle}</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/stock" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60">{t.backToDashboard}</Link>
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{t.refresh}</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">{t.uploadTitle}</h2>
          <label className="block text-sm font-medium text-foreground/80">
            {t.documentType}
            <select className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.documentType} onChange={(event) => setForm((prev) => ({ ...prev, documentType: event.target.value }))}>
              {documentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.entityType}
            <select className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={form.entityType} onChange={(event) => setForm((prev) => ({ ...prev, entityType: event.target.value }))}>
              {entityTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.entityId}
            <input autoFocus className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Shipment or order id" value={form.entityId} onChange={(event) => setForm((prev) => ({ ...prev, entityId: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.documentNumber}
            <input className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Invoice / gatepass no" value={form.documentNumber} onChange={(event) => setForm((prev) => ({ ...prev, documentNumber: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.notes}
            <textarea className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" rows="3" placeholder="Optional comments" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </label>
          <label className="block text-sm font-medium text-foreground/80">
            {t.file}
            <input type="file" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" onChange={(event) => setForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
          </label>
          <button type="submit" disabled={uploading} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {uploading ? t.upload : t.upload}
          </button>
        </form>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t.recentDocuments}</h2>
            <div className="text-xs text-muted-foreground">{documents.length}</div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">{t.loading}</div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{t.empty}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/70 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Entity</th>
                      <th className="px-3 py-2">No.</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {documentPagination.rows.map((document) => (
                      <tr
                        key={document.id}
                        className="cursor-pointer transition hover:bg-primary/5 focus-within:bg-primary/5"
                        onClick={() => openDocumentPreview(document)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openDocumentPreview(document);
                          }
                        }}
                        title="Click to preview"
                      >
                        <td className="px-3 py-2">{document.document_type}</td>
                        <td className="px-3 py-2">{document.entity_type} #{document.entity_id}</td>
                        <td className="px-3 py-2">{document.document_number || '—'}</td>
                        <td className="px-3 py-2 text-foreground/80">{document.file_name}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground" title={document.notes || ''}>{document.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={documentPagination.page}
                pageCount={documentPagination.pageCount}
                total={documentPagination.total}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setDocumentPage}
              />
            </>
          )}
        </div>
      </div>

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        sections={[
          {
            title: 'Document Details',
            children: (
              <PreviewKeyValueGrid
                items={[
                  { label: 'Document Type', value: previewState.record?.document_type },
                  { label: 'Entity Type', value: previewState.record?.entity_type },
                  { label: 'Entity ID', value: previewState.record?.entity_id },
                  { label: 'Document Number', value: previewState.record?.document_number },
                  { label: 'File Name', value: previewState.record?.file_name },
                  { label: 'Mime Type', value: previewState.record?.mime_type },
                  { label: 'File Size', value: previewState.record?.file_size_bytes ? `${previewState.record.file_size_bytes} bytes` : '—' },
                  { label: 'Created At', value: previewState.record?.created_at },
                  { label: 'Notes', value: previewState.record?.notes },
                ]}
              />
            ),
          },
          previewState.record
            ? {
                title: 'File Preview',
                children: renderDocumentPreview(previewState.record),
              }
            : null,
        ]}
      />
    </div>
  );
}

```


---
### FILE: ./app/stock/approvals/page.js
```javascript
export { default } from '../admin/page';

```


---
### FILE: ./app/login/page.js
```javascript
import BrandedLoginPage from '@/components/BrandedLoginPage';
import { cookies } from 'next/headers';

export default async function LoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();
  const cookieReturnTo = cookieStore.get('hm-login-return-to')?.value;
  const returnTo = resolvedSearchParams?.returnTo || cookieReturnTo || '/';

  return <BrandedLoginPage returnTo={returnTo} />;
}

```


---
### FILE: ./app/wishlist/page.js
```javascript
"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Trash2, ShoppingCart, ArrowRight, Sparkles, Package, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAllProducts } from '@/lib/products';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';

function WishlistPage() {
  const { user, isLoading } = useUser();
  const { language } = useLanguage();
  const { addItem } = useCart();
  const allProducts = getAllProducts();
  
  // Initialize with some products from the actual catalog
  const [wishlistItems, setWishlistItems] = useState(
    allProducts.slice(0, 3).map(p => ({
      id: p.id,
      slug: p.slug,
      name: language === 'hi' ? p.nameHi : p.name,
      price: p.price,
      image: p.mainImage,
      category: language === 'hi' ? p.categoryHi : p.category,
      rating: p.rating
    }))
  );
  const [removingId, setRemovingId] = useState(null);

  const removeFromWishlist = (id) => {
    setRemovingId(id);
    setTimeout(() => {
      setWishlistItems(wishlistItems.filter(item => item.id !== id));
      setRemovingId(null);
    }, 300);
  };

  const handleAddToCart = (item) => {
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      currency: "INR",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your wishlist...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <Heart className="w-4 h-4 mr-2 fill-current" />
            {language === 'hi' ? 'सेव किए गए आइटम' : 'Saved Items'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {language === 'hi' ? 'मेरी विशलिस्ट' : 'My Wishlist'}
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {wishlistItems.length > 0 
              ? language === 'hi' 
                ? `आपने ${wishlistItems.length} आइटम बाद के लिए सेव किए हैं`
                : `You have ${wishlistItems.length} item${wishlistItems.length !== 1 ? 's' : ''} saved for later`
              : language === 'hi' 
                ? 'अपने पसंदीदा आइटम यहां सेव करें'
                : 'Save your favorite items here'
            }
          </p>
        </div>

        {wishlistItems.length === 0 ? (
          /* Empty State */
          <Card className="max-w-md mx-auto bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <CardContent className="p-12 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
              <div className="relative">
                <div className="relative mx-auto w-24 h-24 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-30" />
                  <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <Heart className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {language === 'hi' ? 'आपकी विशलिस्ट खाली है' : 'Your wishlist is empty'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {language === 'hi' 
                    ? 'हमारे कलेक्शन को एक्सप्लोर करें और अपने पसंदीदा आइटम सेव करें!'
                    : 'Start exploring our collection and save items you love!'
                  }
                </p>
                <Button className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all duration-300" asChild>
                  <Link href="/#products" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {language === 'hi' ? 'उत्पाद देखें' : 'Explore Products'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Wishlist Items Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlistItems.map((item, index) => (
              <Card 
                key={item.id} 
                className={cn(
                  "group bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden",
                  removingId === item.id ? "scale-95 opacity-0" : "hover:-translate-y-2"
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-0 relative">
                  {/* Image Section */}
                  <Link href={`/products/${item.slug}`}>
                    <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Package className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Category Badge */}
                      <Badge 
                        className="absolute top-3 left-3 bg-primary/90 text-primary-foreground backdrop-blur-sm"
                      >
                        {item.category}
                      </Badge>

                      {/* Heart Icon */}
                      <div className="absolute top-3 right-3">
                        <div className="h-10 w-10 rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
                          <Heart className="h-5 w-5 text-primary fill-primary" />
                        </div>
                      </div>

                      {/* Quick Actions on Hover */}
                      <div className="absolute bottom-3 left-3 right-3 flex gap-2 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <Button 
                          size="sm" 
                          className="flex-1 rounded-full bg-white text-black hover:bg-white/90 shadow-lg"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAddToCart(item);
                          }}
                        >
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Add to Cart
                        </Button>
                      </div>
                    </div>
                  </Link>

                  {/* Content Section */}
                  <div className="p-5">
                    {/* Rating */}
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-medium">{item.rating}</span>
                    </div>

                    <Link href={`/products/${item.slug}`}>
                      <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors line-clamp-1">{item.name}</h3>
                    </Link>
                    <p className="text-2xl font-bold text-primary mb-4">₹{item.price.toLocaleString()}</p>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="default"
                        className="flex-1 rounded-full"
                        onClick={() => handleAddToCart(item)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Cart
                      </Button>
                      <Button 
                        variant="outline"
                        size="icon"
                        className="rounded-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors"
                        onClick={() => removeFromWishlist(item.id)}
                        title="Remove from wishlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Continue Shopping CTA */}
        {wishlistItems.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" className="rounded-full px-8" asChild>
              <Link href="/#products" className="flex items-center gap-2">
                {language === 'hi' ? 'खरीदारी जारी रखें' : 'Continue Shopping'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withPageAuthRequired(WishlistPage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});

```


---
### FILE: ./next.config.js
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 's.gravatar.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
      {
        // Cache static assets aggressively
        source: '/(.*)\\.(ico|png|jpg|jpeg|svg|webp|avif|woff|woff2|ttf)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig

```


---
### FILE: ./styles/theme.css
```javascript
@layer base {
  :root {
    --color-background: #ffffff;
    --color-text: rgb(64, 28, 8);
    --color-primary: rgb(255, 92, 2);
    --color-secondary: rgba(83, 112, 93, 0.1);
    --color-border: rgba(0, 0, 0, 0.1);
    --color-header: rgba(255, 255, 255, 1);
    --color-footer: rgba(255, 255, 255, 1);
    --color-card-bg: rgba(255, 255, 255, 1);
    --shadow-color: rgba(0, 0, 0, 0.1);
  }

  .dark {
    --color-background: #1a1a1a;
    --color-text: #f5f5f5;
    --color-primary: rgb(255, 92, 2);
    --color-secondary: rgba(134, 175, 150, 0.1);
    --color-border: rgba(255, 255, 255, 0.1);
    --color-header: rgba(26, 26, 26, 0.95);
    --color-footer: rgba(26, 26, 26, 0.95);
    --color-card-bg: rgba(32, 32, 32, 0.95);
    --shadow-color: rgba(0, 0, 0, 0.3);
  }

  body {
    @apply bg-background text-foreground transition-colors duration-300;
  }
}

```


---
### FILE: ./styles/globals.css
```javascript
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;


/* Keyframe Definitions */
@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-15px); }
  100% { transform: translateY(0px); }
}

@keyframes slide-up {
  from { transform: translateY(50px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.3); }
  50% { box-shadow: 0 0 40px rgba(var(--primary-rgb), 0.5); }
}

@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes stock-tab-panel-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Animations */
.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}

.animate-scale-in {
  animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-slide-up {
  animation: slide-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 4s ease infinite;
}

.stock-tab-panel {
  animation: stock-tab-panel-enter 220ms ease-out;
}

@layer components {
  /* Base animation states with no animation */
  .animate-on-scroll {
    opacity: 0;
    transform: translateY(20px);
  }

  /* Applied when element comes into view */
  .animate-on-scroll.in-view {
    opacity: 1;
    transform: translateY(0);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .float-on-scroll {
    opacity: 0;
  }

  .float-on-scroll.in-view {
    opacity: 1;
    animation: float 6s ease-in-out;
  }

  .scale-on-scroll {
    opacity: 0;
    transform: scale(0.95);
  }

  .scale-on-scroll.in-view {
    opacity: 1;
    transform: scale(1);
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .fade-on-scroll {
    opacity: 0;
  }

  .fade-on-scroll.in-view {
    opacity: 1;
    transition: opacity 0.5s ease-out;
  }

  /* Interactive animations (these don't need scroll triggering) */
  .hover-scale {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  
  .hover-scale:hover {
    transform: scale(1.05);
  }

  .hover-lift {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
  }

  .hover-lift:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
  }

  .shimmer {
    background: linear-gradient(
      90deg,
      rgba(26, 26, 26, 0) 0%,
      rgb(255, 125, 50) 50%,
      rgba(9, 9, 9, 0) 100%
    );
    background-size: 1000px 100%;
    animation: shimmer 3s linear;
  }

  /* Gradient text */
  .gradient-text {
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-foreground) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Modern button styles */
  .btn-modern {
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .btn-modern::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.5s;
  }

  .btn-modern:hover::before {
    left: 100%;
  }

  /* Card shine effect */
  .card-shine {
    position: relative;
    overflow: hidden;
  }

  .card-shine::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      to bottom right,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 40%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0) 60%,
      rgba(255, 255, 255, 0) 100%
    );
    transform: rotate(45deg);
    transition: all 0.5s;
    opacity: 0;
  }

  .card-shine:hover::after {
    opacity: 1;
    transform: rotate(45deg) translate(50%, 50%);
  }
}
 
@layer base {
  :root {
    --background: #f8fafc;
    --foreground: #020817;
 
    --muted: #f1f5f9;
    --muted-foreground: #64748b;
 
    --popover: #ffffff;
    --popover-foreground: #020817;
 
    --card: #ffffff;
    --card-foreground: #020817;
 
    --border: #e2e8f0;
    --input: #e2e8f0;
 
    --primary: #10b981;
    --primary-foreground: #ffffff;
 
    --secondary: #e2e8f0;
    --secondary-foreground: #0f172a;
 
    --accent: #ecfeff;
    --accent-foreground: #0f172a;
 
    --destructive: #ef4444;
    --destructive-foreground: #f8fafc;
 
    --ring: #10b981;
 
    --radius: 0.5rem;
  }
 
  .dark {
    --background: #020617;
    --foreground: #f8fafc;
 
    --muted: #0f172a;
    --muted-foreground: #94a3b8;
 
    --popover: #020817;
    --popover-foreground: #f8fafc;
 
    --card: #0f172a;
    --card-foreground: #f8fafc;
 
    --border: #1e293b;
    --input: #1e293b;
 
    --primary: #10b981;
    --primary-foreground: #ffffff;
 
    --secondary: #0f172a;
    --secondary-foreground: #e2e8f0;
 
    --accent: #082f49;
    --accent-foreground: #e0f2fe;
 
    --destructive: #7f1d1d;
    --destructive-foreground: #f8fafc;
 
    --ring: #10b981;
  }
}
 
@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans;
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  }
}





.loading-state, .error-state {
  background-color: #2d313c;
  border-radius: 15px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
  padding: 3rem;
  text-align: center;
}

.loading-text {
  font-size: 1.8rem;
  font-weight: 500;
  color: #a0aec0;
  animation: pulse 1.5s infinite ease-in-out;
}

.main-card-wrapper {
  background-color: #262a33;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 3rem;
  max-width: 500px;
  width: 90%;
  animation: fadeInScale 0.8s ease-out forwards;
}

.auth0-logo {
  width: 0px;
  margin-bottom: 1.5rem;
  opacity: 0;
  animation: slideInDown 1s ease-out forwards 0.2s;
}

.action-card {
  background-color: #2d313c;
  border-radius: 15px;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.3), 0 5px 15px rgba(0, 0, 0, 0.3);
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.8rem;
  width: calc(100% - 2rem);
  opacity: 0;
  animation: fadeIn 1s ease-out forwards 0.6s;
}

.action-text {
  font-size: 1.25rem;
  color: #cbd5e0;
  text-align: center;
  line-height: 1.6;
  font-weight: 400;
}

.button {
  padding: 1.1rem 2.8rem;
  font-size: 1.2rem;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  outline: none;
}

.button:focus {
  box-shadow: 0 0 0 4px rgba(99, 179, 237, 0.5);
}

.button.login {
  background-color: #63b3ed;
  color: #1a1e27;
}

.button.login:hover {
  background-color: #4299e1;
  transform: translateY(-5px) scale(1.03);
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.5);
}

.button.logout {
  background-color: #fc8181;
  color: #1a1e27;
}

.button.logout:hover {
  background-color: #e53e3e;
  transform: translateY(-5px) scale(1.03);
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.5);
}

.logged-in-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
}

.logged-in-message {
  font-size: 1.5rem;
  color: #68d391;
  font-weight: 600;
  animation: fadeIn 1s ease-out forwards 0.8s;
}

.profile-card {
  padding: 2.2rem;
  animation: scaleIn 0.8s ease-out forwards 1.2s;
}

.profile-picture {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  transition: transform 0.3s ease-in-out;
  object-fit: cover;
}

.profile-picture:hover {
  transform: scale(1.05);
}

.profile-name {
  font-size: 2rem;
  margin-top: 0.5rem;
}

.profile-email {
  font-size: 1.15rem;
  text-align: center;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInScale {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes slideInDown {
  from { opacity: 0; transform: translateY(-70px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

@media (max-width: 600px) {
  .main-card-wrapper {
    padding: 2rem;
    gap: 1.5rem;
  }
  
  .main-title {
    font-size: 2.2rem;
  }
  
  .button {
    padding: 0.9rem 2rem;
    font-size: 1rem;
  }
  
  .auth0-logo {
    width: 0px;
  }
}
```


---
### FILE: ./styles/Home.module.css
```javascript

```


---
### FILE: ./components/ui/pagination-controls.jsx
```javascript
export default function PaginationControls({
  page,
  pageCount,
  total,
  pageSize = 10,
  onPageChange,
}) {
  if (total <= pageSize) {
    return null;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="font-medium text-slate-700">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

```


---
### FILE: ./components/ui/product-form.jsx
```javascript
"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { X, CheckCircle2, Send, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/hooks/useInView"

const WHATSAPP_NUMBER = "919696103802";

const Input = React.forwardRef(
  ({ className, type, label, error, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            className="text-sm font-medium text-foreground/90"
            htmlFor={props.id}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type={type}
            className={cn(
              "w-full px-3 py-2.5 rounded-lg",
              "bg-background",
              "border border-input",
              "text-sm text-foreground",
              "placeholder:text-muted-foreground",
              "transition-all duration-300",
              "focus:outline-none focus:ring-2",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className,
            )}
            ref={ref}
            {...props}
          />
          {error && (
            <div className="absolute -right-6 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-destructive" />
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}
      </div>
    )
  },
)
Input.displayName = "Input"

const Select = React.forwardRef(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            className="text-sm font-medium text-foreground/90"
            htmlFor={props.id}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              "w-full px-3 py-2.5 rounded-lg appearance-none",
              "bg-background",
              "border border-input",
              "text-sm text-foreground",
              "transition-all duration-300",
              "focus:outline-none focus:ring-2",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "pr-10",
              className,
            )}
            ref={ref}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg className="h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}
      </div>
    )
  },
)
Select.displayName = "Select"

// Rate limit: 1 minute between submissions
function checkRateLimit() {
  if (typeof window === "undefined") return true;
  const last = localStorage.getItem("lastQuoteSubmitTime");
  if (last && Date.now() - parseInt(last) < 60000) {
    return false;
  }
  return true;
}

export function ProductForm({ className, ...props }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  const [formRef, isFormInView] = useInView({ threshold: 0.1 });
  const [submitted, setSubmitted] = React.useState(false);
  const [rateLimited, setRateLimited] = React.useState(false);

  const brandOptions = [
    { value: "", label: "Select a brand…" },
    { value: "Kajaria", label: "Kajaria" },
    { value: "Kajaria Eternity", label: "Kajaria Eternity" },
    { value: "Cera", label: "Cera" },
    { value: "Varmora", label: "Varmora" },
    { value: "Other", label: "Other" },
  ]

  const buildEmailBody = (data) =>
    `Dear Hanumant Marble Team,\n\n` +
    `I would like to request a quote for the following:\n\n` +
    `Product Details:\n` +
    `- Brand: ${data.brand}\n` +
    `- Product Name/Number: ${data.product}\n` +
    `- Quantity: ${data.quantity}\n\n` +
    `Contact Information:\n` +
    `- Name: ${data.fullname}\n` +
    `- Email: ${data.email}\n` +
    `- Mobile: ${data.mobile || "Not provided"}\n\n` +
    `Best regards,\n${data.fullname}`;

  const onSubmit = (data) => {
    if (!checkRateLimit()) {
      setRateLimited(true);
      return;
    }

    localStorage.setItem("lastQuoteSubmitTime", Date.now().toString());

    const emailSubject = encodeURIComponent(`Quote Request for ${data.brand} ${data.product}`);
    const emailBody = encodeURIComponent(buildEmailBody(data));
    window.location.href = `mailto:hanumantmarble@rediffmail.com?subject=${emailSubject}&body=${emailBody}`;

    setSubmitted(true);
    reset();
  };

  const handleWhatsApp = (data) => {
    const message = encodeURIComponent(
      `Hi! I'd like a quote for:\nBrand: ${data.brand}\nProduct: ${data.product}\nQty: ${data.quantity}\nName: ${data.fullname}\nPhone: ${data.mobile || "N/A"}`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank", "noopener,noreferrer");
    setSubmitted(true);
    reset();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-6 animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-2xl font-bold mb-2">Quote Request Sent!</h3>
          <p className="text-muted-foreground max-w-xs">
            Your email app has opened with all the details. We'll get back to you within 24 hours.
          </p>
        </div>
        <button
          onClick={() => setSubmitted(false)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className={cn(
        "space-y-5 w-full fade-on-scroll",
        isFormInView ? "in-view" : "",
        className
      )}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {rateLimited && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Please wait a minute before submitting another request.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          id="fullname"
          label="Full Name *"
          {...register("fullname", { required: "Name is required" })}
          placeholder="Your full name"
          error={errors.fullname}
          autoComplete="name"
        />
        <Input
          id="email"
          label="Email Address *"
          type="email"
          {...register("email", {
            required: "Email is required",
            pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email address" },
          })}
          placeholder="you@example.com"
          error={errors.email}
          autoComplete="email"
        />
      </div>

      <Input
        id="mobile"
        label="Mobile Number"
        type="tel"
        {...register("mobile", {
          pattern: { value: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
        })}
        placeholder="+91 98765 43210"
        error={errors.mobile}
        autoComplete="tel"
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Select
          id="brand"
          label="Brand *"
          {...register("brand", { required: "Please select a brand", validate: (v) => v !== "" || "Please select a brand" })}
          options={brandOptions}
          error={errors.brand}
        />
        <Input
          id="quantity"
          label="Quantity *"
          {...register("quantity", { required: "Quantity is required" })}
          placeholder="e.g. 50 boxes"
          error={errors.quantity}
        />
      </div>

      <Input
        id="product"
        label="Product Name / Number *"
        {...register("product", { required: "Product name is required" })}
        placeholder="e.g. Kajaria Evoque Beige 600x600"
        error={errors.product}
      />

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl",
            "bg-primary text-primary-foreground font-semibold text-sm",
            "transition-all duration-300 hover:bg-primary/90 hover:scale-[1.02]",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          {isSubmitting ? "Opening email…" : "Send via Email"}
        </button>

        <button
          type="button"
          onClick={handleSubmit(handleWhatsApp)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl",
            "bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold text-sm",
            "transition-all duration-300 hover:scale-[1.02]",
            "focus:outline-none focus:ring-2 focus:ring-[#25D366]/30",
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Send via WhatsApp
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        * Required fields. We'll respond within 24 hours.
      </p>
    </form>
  )
}

```


---
### FILE: ./components/ui/scroll-to-top.jsx
```javascript
"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "w-12 h-12 rounded-full shadow-lg",
        "bg-primary text-primary-foreground",
        "flex items-center justify-center",
        "transition-all duration-300 hover:scale-110 active:scale-95",
        "focus:outline-none focus:ring-4 focus:ring-primary/30",
        visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

```


---
### FILE: ./components/ui/hero-carousel.jsx
```javascript
"use client";

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeroCarousel({
  images = ["/hero1.png", "/hero2.jpeg", "/hero3.jpeg", "/hero4.jpeg", "/hero5.jpeg", "/hero6.jpeg"],
  title = "FOR YOUR SWEET HOME",
  subtitle = "One of the biggest collection of tiles and sanitaryware in Lucknow. Build your dream home with us.",
  ctaText = "Get Quote",
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 4500, stopOnInteraction: false })]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState([]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  const scrollTo = useCallback((index) => {
    if (emblaApi) emblaApi.scrollTo(index)
  }, [emblaApi])

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    setScrollSnaps(emblaApi.scrollSnapList())
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => emblaApi.off('select', onSelect)
  }, [emblaApi, onSelect])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') scrollPrev()
      if (e.key === 'ArrowRight') scrollNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [scrollPrev, scrollNext])

  return (
    <section className="relative bg-background text-foreground overflow-hidden" aria-label="Hero carousel">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((image, index) => (
            <div className="relative h-[75vh] w-full flex-shrink-0 min-w-0" key={index}>
              <Image
                src={image}
                alt={`Hanumant Marble showroom image ${index + 1}`}
                fill
                className="object-cover"
                priority={index === 0}
                sizes="100vw"
              />
              {/* Enhanced gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {/* Carousel Controls */}
      <div className="absolute bottom-8 right-8 flex gap-3 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollPrev}
          aria-label="Previous slide"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollNext}
          aria-label="Next slide"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20" role="tablist" aria-label="Slide indicators">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === selectedIndex}
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => scrollTo(index)}
            className={cn(
              "rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/60",
              index === selectedIndex
                ? "bg-white w-6 h-2.5"
                : "bg-white/40 hover:bg-white/60 w-2.5 h-2.5"
            )}
          />
        ))}
      </div>

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Hero Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4">
        <Badge
          variant="outline"
          className="mb-6 px-4 py-2 bg-white/10 backdrop-blur-md text-white border-white/20 hover:bg-white/20 transition-all animate-float"
        >
          <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
          Premium Collection
        </Badge>
        
        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 tracking-tight animate-slide-up">
          <span className="block">{title}</span>
        </h1>
        
        <p className="max-w-[600px] text-white/90 text-base sm:text-lg md:text-xl mb-6 sm:mb-10 leading-relaxed animate-slide-up px-4" style={{ animationDelay: '200ms' }}>
          {subtitle}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-16 px-4">
          <Button
            size="lg"
            className="animate-scale-in rounded-full px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg bg-white text-black hover:bg-white/90 shadow-2xl hover:shadow-white/25 hover:scale-105 transition-all duration-300"
            style={{ animationDelay: '400ms' }}
            asChild
          >
            <a href="/quote" className="flex items-center gap-2">
              {ctaText}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="animate-scale-in rounded-full px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg bg-transparent text-white border-2 border-white/30 hover:bg-white/10 hover:border-white/50 hover:scale-105 transition-all duration-300"
            style={{ animationDelay: '500ms' }}
            asChild
          >
            <a href="#products">
              Explore Products
            </a>
          </Button>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-5 pointer-events-none" aria-hidden="true" />
    </section>
  );
}

```


---
### FILE: ./components/ui/skeleton.jsx
```javascript
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border-0 bg-card/50 shadow-lg overflow-hidden">
      {/* Image area */}
      <Skeleton className="h-48 sm:h-64 w-full rounded-none" />
      {/* Content */}
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* Footer */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex justify-between items-center">
        <div className="space-y-1">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    </div>
  );
}

export function ProductsGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

```


---
### FILE: ./components/ui/branches.jsx
```javascript
"use client"

import { Building2, MapPin, Phone, BarChart, MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnimateOnScroll } from "@/lib/hooks/useAnimateOnScroll"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"

const branchKeys = ["ringRoad", "vrindavan", "sultanpur", "buddheshwar"]

const branchLocations = {
  ringRoad: { lat: 26.8467, lng: 80.9462 },
  vrindavan: { lat: 26.8601, lng: 80.9465 },
  sultanpur: { lat: 26.8220, lng: 80.9716 },
  buddheshwar: { lat: 26.8741, lng: 80.9451 }
}

const branchColors = [
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-purple-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-green-500"
]

function AnimatedDiv({ baseClasses, animationClasses, delay, children }) {
  const { ref, inView } = useAnimateOnScroll({ threshold: 0.1, triggerOnce: true });
  return (
    <div
      ref={ref}
      className={cn(baseClasses, "animate-on-scroll", inView && animationClasses)}
      style={{ transitionDelay: inView ? delay : "0ms" }}
    >
      {children}
    </div>
  );
}

export function Branches() {
  const { language } = useLanguage();
  const { ref: titleRef, inView: isTitleInView } = useAnimateOnScroll({ threshold: 0.2, triggerOnce: true });

  const getMapUrl = (location) => {
    return `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.002},${location.lat - 0.002},${location.lng + 0.002},${location.lat + 0.002}&layer=mapnik&marker=${location.lat},${location.lng}`
  }

  return (
    <section id="branches" className="relative py-12 sm:py-20 bg-gradient-to-b from-background via-muted/30 to-background overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <MapPinned className="w-4 h-4" />
            Visit Us
          </div>
          <h2 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('branches.title', language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-lg max-w-2xl mx-auto animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            Find our showrooms across Lucknow for the best in-person experience
          </p>
          <div className={cn(
            "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {branchKeys.map((key, index) => (
            <AnimatedDiv
              key={index}
              baseClasses="group bg-card/80 backdrop-blur-sm text-card-foreground rounded-2xl shadow-lg hover:shadow-2xl p-6 transition-all duration-500 hover:-translate-y-2 border-0"
              animationClasses="fade-on-scroll in-view"
              delay={`${index * 100}ms`}
            >
              <div className="flex flex-col gap-4">
                {/* Branch Header */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br transition-transform duration-300 group-hover:scale-110",
                    branchColors[index]
                  )}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{getTranslation(`branches.locations.${key}.name`, language)}</h3>
                </div>

                {/* Map */}
                <AnimatedDiv
                  baseClasses="overflow-hidden rounded-xl h-[180px] shadow-inner"
                  animationClasses="in-view"
                  delay={`${index * 100 + 200}ms`}
                >
                  <iframe
                    title={getTranslation(`branches.locations.${key}.name`, language)}
                    width="100%"
                    height="100%"
                    src={getMapUrl(branchLocations[key])}
                    className="rounded-xl"
                    loading="lazy"
                  />
                </AnimatedDiv>

                {/* Address */}
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                  <p className="text-muted-foreground leading-relaxed">{getTranslation(`branches.locations.${key}.address`, language)}</p>
                </div>
                
                {/* Phone */}
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-muted-foreground">+91 9696103802</p>
                </div>
                
                {/* Stats */}
                <div className={cn(
                  "flex items-center gap-3 mt-2 text-sm font-medium border-t border-border/50 pt-4"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br",
                    branchColors[index]
                  )}>
                    <BarChart className="h-4 w-4" />
                  </div>
                  <p className="text-foreground">{getTranslation(`branches.locations.${key}.stats`, language)}</p>
                </div>
              </div>
            </AnimatedDiv>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Branches

```


---
### FILE: ./components/ui/dropdown-menu.jsx
```javascript
"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}

```


---
### FILE: ./components/ui/button.jsx
```javascript
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

```


---
### FILE: ./components/ui/catalogue-viewer.jsx
```javascript
"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X, FileText, ChevronLeft, ChevronRight, ArrowLeft, BookOpen, ZoomIn, ZoomOut, Download, Loader2 } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "./button"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"
import { cn } from "@/lib/utils"

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.mjs`

export function CatalogueViewer({ brand }) {
  const { language } = useLanguage()
  const allCatalogues = [
    {
      name: "Senator Catalogue October 2024",
      path: "/Cera Senator Catalogue October 2024_3.pdf",
      brand: "Cera"
    },
    {
      name: "Ceramics Wall North East",
      path: "/Kajaria Ceramics wall_north_east.pdf",
      brand: "Kajaria"
    },
    {
      name: "Eternity Fullbody Catalogue",
      path: "/Kajaria Eternity fullbody-catalogue-60x120-80x80-60x60.pdf",
      brand: "Kajaria Eternity"
    },
    {
      name: "Monochroma Collection",
      path: "/Varmora-Monochroma-Collection.pdf",
      brand: "Varmora"
    },
    {
      name: "Petrozza Collection",
      path: "/Varmora-Petrozza-Collection.pdf",
      brand: "Varmora"
    }
  ]

  const catalogues = brand 
    ? allCatalogues.filter(cat => cat.brand === brand)
    : allCatalogues

  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedCatalogue, setSelectedCatalogue] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scale, setScale] = useState(1)
  const containerRef = React.useRef(null)
  const dialogRef = React.useRef(null)

  // Update container dimensions on window resize
  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth)
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Handle document loading
  React.useEffect(() => {
    if (!selectedCatalogue) return

    setError(null)
    setIsLoading(true)
    
    pdfjs.getDocument(selectedCatalogue.path).promise
      .then(() => {
        setError(null)
      })
      .catch((err) => {
        setError(getTranslation('catalogue.error', language))
        console.error("PDF loading error:", err)
      })
  }, [retry, selectedCatalogue])

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages)
    setIsLoading(false)
    setError(null)
  }, [])

  const handleError = useCallback((err) => {
    setIsLoading(false)
    setError(getTranslation('catalogue.error', language))
    console.error("PDF error:", err)
  }, [])

  const handleRetry = useCallback(() => {
    setRetry(count => count + 1)
  }, [])

  function CatalogueSelection() {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 overflow-auto flex-1 min-h-0 p-1">
        {catalogues.map((cat, index) => (
          <div
            key={cat.path}
            className={cn(
              "group relative cursor-pointer rounded-2xl overflow-hidden border border-border/50 bg-muted/30",
              "hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300",
              "aspect-[3/4]"
            )}
            onClick={() => {
              setSelectedCatalogue(cat)
              setPageNumber(1)
              setScale(1)
              setIsLoading(true)
            }}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Thumbnail */}
            <div className="absolute inset-0">
              <Document
                file={cat.path}
                loading={null}
                error={null}
              >
                <Page
                  pageNumber={1}
                  width={300}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                  className="opacity-90 group-hover:opacity-100 transition-opacity"
                />
              </Document>
            </div>
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-70 group-hover:opacity-90 transition-opacity" />
            
            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/20 text-white text-xs font-medium mb-2">
                  <BookOpen className="h-3 w-3" />
                  {cat.brand}
                </span>
                <h3 className="text-white font-semibold text-sm sm:text-base leading-tight">{cat.name}</h3>
              </div>
              
              {/* View button on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <FileText className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function PDFViewer() {
    if (!selectedCatalogue) return null

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 2))
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5))
    const handleDownload = () => window.open(selectedCatalogue.path, '_blank')

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with back button and title */}
        <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedCatalogue(null)}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ArrowLeft className="h-4 w-4" /> 
            </Button>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-1">{selectedCatalogue.name}</h3>
              <p className="text-xs text-muted-foreground">{selectedCatalogue.brand}</p>
            </div>
          </div>
          
          {/* Zoom & Download Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={scale >= 2}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Content */}
        <div 
          ref={containerRef} 
          className="flex-1 overflow-auto min-h-0 relative rounded-xl bg-muted/30"
        >
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{getTranslation('catalogue.loading', language)}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-4 text-center p-6 max-w-sm">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <p className="text-destructive font-medium">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetry}
                  className="rounded-full"
                >
                  {getTranslation('catalogue.tryAgain', language)}
                </Button>
              </div>
            </div>
          )}
          <Document
            file={selectedCatalogue.path}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            className="mx-auto w-full py-4"
            onLoadError={handleError}
          >
            <Page
              pageNumber={pageNumber}
              className="mx-auto shadow-2xl"
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
              width={Math.min(containerWidth * 0.95, 1100) * scale}
              onRenderSuccess={() => setIsLoading(false)}
              onLoadError={handleError}
            />
          </Document>
        </div>

        {/* Navigation Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 pt-4 mt-4">
          {/* Page navigation */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber(1)}
              disabled={pageNumber <= 1}
              className="hidden sm:inline-flex rounded-full h-8 px-3 text-xs hover:bg-primary/10"
            >
              {getTranslation('catalogue.first', language)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={pageNumber}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (value >= 1 && value <= numPages) {
                    setPageNumber(value)
                  }
                }}
                className="w-10 sm:w-12 rounded-md border-0 bg-transparent px-1 py-0.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">{getTranslation('catalogue.of', language)} {numPages || 1}</span>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}
              disabled={pageNumber >= (numPages || 1)}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber(numPages || 1)}
              disabled={pageNumber >= (numPages || 1)}
              className="hidden sm:inline-flex rounded-full h-8 px-3 text-xs hover:bg-primary/10"
            >
              {getTranslation('catalogue.last', language)}
            </Button>
          </div>
          
          {/* Mobile zoom controls */}
          <div className="flex sm:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded-full h-8 w-8"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={scale >= 2}
              className="rounded-full h-8 w-8"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button 
          variant="outline" 
          className="w-full group border border-primary/20 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-xl h-11"
        >
          <BookOpen className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
          {getTranslation('catalogue.viewButton', language)} 
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content 
          ref={dialogRef} 
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "h-[90vh] sm:h-[85vh] w-[95vw] sm:w-[90vw] max-w-[1200px]",
            "rounded-2xl bg-card text-card-foreground p-4 sm:p-6 shadow-2xl border border-border/50",
            "animate-scale-in"
          )}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="text-lg sm:text-xl font-semibold text-foreground">
                    {selectedCatalogue ? getTranslation('catalogue.title', language) : getTranslation('catalogue.selectTitle', language)}
                  </Dialog.Title>
                  {!selectedCatalogue && (
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {catalogues.length} catalogue{catalogues.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
            
            {selectedCatalogue ? <PDFViewer /> : <CatalogueSelection />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

```


---
### FILE: ./components/ui/badge.jsx
```javascript
import { cn } from "@/lib/utils"

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  outline: "text-foreground",
  approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  rejected: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  neutral: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300",
}

export function Badge({ className, variant = "default", ...props }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}

```


---
### FILE: ./components/ui/products-grid.jsx
```javascript
"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { ProductCard } from "./ProductCard";
import { getAllProducts } from "@/lib/products";

export function ProductsGrid() {
  const { language } = useLanguage();
  const allProducts = getAllProducts();

  // Map products to display format with language support
  const products = allProducts.map(product => ({
    id: product.id,
    slug: product.slug,
    name: language === 'hi' ? product.nameHi : product.name,
    title: language === 'hi' ? product.nameHi : product.name,
    description: language === 'hi' ? product.descriptionHi : product.description,
    image: product.mainImage,
    mainImage: product.mainImage,
    price: product.price,
    category: language === 'hi' ? product.categoryHi : product.category,
    rating: product.rating,
    variants: product.variants,
  }));

  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });
  const [gridRef, isGridInView] = useInView({ threshold: 0.2 });

  return (
    <section id="products" className="relative bg-gradient-to-b from-background via-muted/30 to-background text-foreground py-12 sm:py-20 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <Sparkles className="w-4 h-4" />
            {language === 'hi' ? 'ऑनलाइन खरीदें' : 'Shop Online'}
          </div>
          <h2
            className={cn(
              "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
              isTitleInView ? "in-view" : ""
            )}
            style={{ transitionDelay: "100ms" }}
          >
            {getTranslation("shop.sectionTitle", language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto px-4 sm:px-0 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            {language === 'hi' 
              ? 'टाइल इंस्टॉलेशन के लिए प्रीमियम एडहेसिव, ग्राउट और एक्सेसरीज़'
              : 'Premium adhesives, grouts, and accessories for tile installation'
            }
          </p>
          <div
            className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
              isTitleInView ? "in-view" : ""
            )}
            style={{ transitionDelay: "300ms" }}
          ></div>
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {products.map((product, index) => (
            <div
              key={product.id}
              className={cn(
                "animate-on-scroll",
                isGridInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

```


---
### FILE: ./components/ui/scroll-progress.jsx
```javascript
'use client';
import { useEffect, useState } from 'react';

export function ScrollProgress({ color = 'rgb(255, 153, 96)' }) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const updateScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', updateScroll);
    
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 w-full h-1 z-50">
      <div 
        style={{
          width: `${scrollProgress}%`,
          backgroundColor: color,
          height: '100%',
          transition: 'width 0.2s ease'
        }}
      />
    </div>
  );
}

```


---
### FILE: ./components/ui/card.jsx
```javascript
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }

```


---
### FILE: ./components/ui/CartSummary.jsx
```javascript
"use client"

import { ShoppingCart, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";

export function CartSummary() {
  const { cartCount, cartDetails, removeItem, formattedTotalPrice, redirectToCheckout } = useCart();

  const handleCheckout = async () => {
    try {
      await redirectToCheckout();
    } catch (error) {
      console.error('Error during checkout:', error);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative rounded-full hover:scale-105 transition-transform">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-medium shadow-lg">
              {cartCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col bg-card">
        <SheetHeader className="border-b border-border/50 pb-4">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5" />
            Shopping Cart
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-grow py-4">
          {Object.values(cartDetails || {}).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            Object.values(cartDetails || {}).map((item) => (
              <div key={item.id} className="group flex items-center gap-4 py-4 px-2 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="relative h-16 w-16 rounded-xl overflow-hidden shadow-md">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.formattedValue} × {item.quantity}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </ScrollArea>
        <SheetFooter className="mt-auto border-t border-border/50 pt-4">
          <div className="w-full space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{formattedTotalPrice}</span>
            </div>
            <Button
              className="w-full h-12 rounded-full hover:opacity-90 transition-opacity text-lg font-medium"
              onClick={handleCheckout}
              disabled={cartCount === 0}
            >
              Checkout
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

```


---
### FILE: ./components/ui/ProductCard.jsx
```javascript
"use client"

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Star, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductCard({ product }) {
  const { addItem } = useCart();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: product.id,
      name: product.title || product.name,
      price: product.price,
      image: product.image || product.mainImage,
      currency: "INR",
    });
  };

  return (
    <Link href={`/products/${product.slug || product.id}`}>
      <Card className="group overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
        <CardHeader className="p-0">
          <div className="relative h-48 sm:h-64 overflow-hidden bg-gradient-to-br from-muted to-muted/50">
            <Image
              src={product.image || product.mainImage}
              alt={product.title || product.name}
              fill
              className="object-contain p-4 transition-transform duration-700 group-hover:scale-110"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Category Badge */}
            {product.category && (
              <Badge className="absolute top-3 left-3 bg-primary/90 text-primary-foreground border-0">
                {product.category}
              </Badge>
            )}

            {/* Rating Badge */}
            {product.rating && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-black/70 text-sm font-medium">
                <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                {product.rating}
              </div>
            )}

            {/* Quick actions on hover */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 flex gap-2">
              <Button 
                onClick={handleAddToCart}
                size="sm"
                className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Quick Add
              </Button>
              <Button 
                size="sm"
                variant="secondary"
                className="rounded-full shadow-lg bg-white/90 dark:bg-black/70 hover:bg-white dark:hover:bg-black"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <CardTitle className="text-base sm:text-lg font-semibold tracking-tight line-clamp-1">
            {product.title || product.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {product.description}
          </p>
          {/* Variants indicator */}
          {product.variants && product.variants.length > 1 && (
            <p className="text-xs text-primary mt-2 font-medium">
              {product.variants.length} variants available
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 sm:p-5 pt-0">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Price</span>
            <span className="font-bold text-lg sm:text-xl text-foreground">
              ₹{product.price.toLocaleString()}
            </span>
          </div>
          <Button 
            onClick={handleAddToCart} 
            variant="outline"
            className="rounded-full border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300"
          >
            Add to Cart
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}

```


---
### FILE: ./components/ui/navigation-menu.jsx
```javascript
"use client"

import * as React from "react"
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

const NavigationMenu = React.forwardRef(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Root
    ref={ref}
    className={cn(
      "relative z-10 flex max-w-max flex-1 items-center justify-center",
      className
    )}
    {...props}>
    {children}
  </NavigationMenuPrimitive.Root>
))
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName

const NavigationMenuList = React.forwardRef(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn(
      "group flex flex-1 list-none items-center justify-center space-x-1",
      className
    )}
    {...props} />
))
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName

const NavigationMenuItem = NavigationMenuPrimitive.Item

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-10 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-gray-100/50 data-[state=open]:bg-gray-100/50 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus:bg-gray-800 dark:focus:text-gray-50 dark:data-[active]:bg-gray-800/50 dark:data-[state=open]:bg-gray-800/50"
)

const NavigationMenuTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(navigationMenuTriggerStyle(), "group", className)}
    {...props}>
    {children}{" "}
    <ChevronDown
      className="relative top-[1px] ml-1 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180"
      aria-hidden="true" />
  </NavigationMenuPrimitive.Trigger>
))
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName

const NavigationMenuContent = React.forwardRef(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      "left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto ",
      className
    )}
    {...props} />
))
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName

const NavigationMenuLink = NavigationMenuPrimitive.Link

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
}

```


---
### FILE: ./components/ui/scroll-area.jsx
```javascript
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }

```


---
### FILE: ./components/ui/product-showcase.jsx
```javascript
"use client";

import { ArrowRight, Clock, Users, Package, Store, FileText, Award } from "lucide-react";
import { CatalogueViewer } from "./catalogue-viewer";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const statsData = [
  {
    value: "30+",
    key: "yearsExperience",
    icon: <Clock className="w-7 h-7" />,
    color: "from-blue-500 to-cyan-500",
  },
  {
    value: "40+",
    key: "employees",
    icon: <Users className="w-7 h-7" />,
    color: "from-violet-500 to-purple-500",
  },
  {
    value: "500+",
    key: "products",
    icon: <Package className="w-7 h-7" />,
    color: "from-orange-500 to-amber-500",
  },
  {
    value: "4",
    key: "showrooms",
    icon: <Store className="w-7 h-7" />,
    color: "from-emerald-500 to-green-500",
  },
];

function Stat({ icon, value, label, inView, delay, color }) {
  return (
    <div
      className={cn(
        "text-center animate-on-scroll group",
        inView ? "in-view" : ""
      )}
      style={{ transitionDelay: delay }}
    >
      <div className="flex flex-col items-center">
        <div className={cn(
          "mb-3 sm:mb-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br text-white shadow-lg transform transition-transform duration-300 group-hover:scale-110",
          color
        )}>
          {icon}
        </div>
        <div className="text-2xl sm:text-4xl font-bold text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground mt-1 font-medium">{label}</div>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  const { language } = useLanguage();

  // These are actually brands we carry in-store, each with its own catalogue
  const brands = [
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4g",
      key: "premiumTiles",
      image: "/Varmora.png",
      brand: "Varmora",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4h",
      key: "sanitaryware",
      image: "/Cera.png",
      brand: "Cera",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4i",
      key: "wallTiles",
      image: "/Kajaria.png",
      brand: "Kajaria",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4j",
      key: "floorTiles",
      image: "/Kajaria Eternity.png",
      brand: "Kajaria Eternity",
    },
  ];

  const stats = statsData.map((stat) => ({
    ...stat,
    label: getTranslation(`stats.${stat.key}`, language),
  }));

  const [statsRef, isStatsInView] = useInView({ threshold: 0.2 });
  const [productsRef, isProductsInView] = useInView({ threshold: 0.2 });
  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });

  return (
    <section id="brands" className="relative bg-gradient-to-b from-muted/50 via-background to-muted/30 text-foreground py-12 sm:py-20 overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-20">
          <Card className={cn(
            "p-4 sm:p-8 md:p-12 bg-card/80 backdrop-blur-sm border-0 shadow-xl fade-on-scroll",
            isStatsInView ? "in-view" : ""
          )}>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 md:gap-12 p-0">
              {stats.map((stat, index) => (
                <Stat
                  key={index}
                  icon={stat.icon}
                  value={stat.value}
                  label={stat.label}
                  inView={isStatsInView}
                  delay={`${index * 100}ms`}
                  color={stat.color}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Heading */}
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <Award className="w-4 h-4" />
            Trusted Partners
          </div>
          <h2 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('products.sectionTitle', language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto px-4 sm:px-0 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            We partner with India's leading tile and sanitaryware brands
          </p>
          <div className={cn(
            "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}></div>
        </div>

        {/* Brands Section (with Catalogue Viewer) */}
        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {brands.map((b, index) => (
            <div
              key={b.brand}
              className={cn(
                "animate-on-scroll",
                isProductsInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <Card className="group overflow-hidden h-full flex flex-col border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                <CardHeader className="p-0">
                  <div className="relative h-48 bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
                    <img
                      src={b.image}
                      alt={b.brand}
                      className="h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-110"
                    />
                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full" style={{ transitionDuration: '700ms' }} />
                  </div>
                </CardHeader>
                <CardContent className="p-5 flex-1">
                  <CardTitle className="text-xl font-semibold tracking-tight">{b.brand}</CardTitle>
                  <CardDescription className="mt-2 text-sm line-clamp-2">
                    {getTranslation(`products.${b.key}.description`, language)}
                  </CardDescription>
                </CardContent>
                <CardFooter className="p-5 pt-0">
                  <CatalogueViewer brand={b.brand} />
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

```


---
### FILE: ./components/ui/whatsapp-button.jsx
```javascript
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MessageCircle, X } from "lucide-react";

const WHATSAPP_NUMBER = "919696103802"; // Country code + number, no +
const DEFAULT_MESSAGE = "Hello! I'm interested in your marble and tile products. Could you please help me?";

export function WhatsAppButton() {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    const encodedMessage = encodeURIComponent(DEFAULT_MESSAGE);
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3">
      {/* Tooltip */}
      <div
        className={cn(
          "bg-white dark:bg-card text-foreground text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg border border-border/50 whitespace-nowrap transition-all duration-300 pointer-events-none",
          showTooltip
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-2"
        )}
      >
        Chat with us on WhatsApp
        <span className="text-muted-foreground block text-xs font-normal mt-0.5">
          Typically replies within minutes
        </span>
      </div>

      {/* Button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label="Chat with us on WhatsApp"
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
          "bg-[#25D366] hover:bg-[#20BD5A] text-white",
          "transition-all duration-300 hover:scale-110 active:scale-95",
          "focus:outline-none focus:ring-4 focus:ring-[#25D366]/30"
        )}
      >
        {/* WhatsApp SVG icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-7 h-7"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>

        {/* Pulse ring animation */}
        <span className="absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-25 animate-ping pointer-events-none" aria-hidden="true" />
      </button>
    </div>
  );
}

```


---
### FILE: ./components/ui/AuthButton.jsx
```javascript
"use client"

import * as React from "react"
import Link from "next/link"
import { useUser } from '@auth0/nextjs-auth0/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { User, LogOut, ShoppingBag, Heart, Settings } from "lucide-react"

export function AuthButton() {
  const { user, error, isLoading } = useUser()

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full animate-pulse">
        <div className="h-5 w-5 bg-muted rounded-full" />
      </Button>
    )
  }

  if (error) {
    return (
      <Button variant="ghost" asChild className="rounded-full">
        <Link href="/auth/login">Login</Link>
      </Button>
    )
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || 'User profile'}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>
            <p className="font-semibold truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/orders" className="cursor-pointer">
              <ShoppingBag className="mr-2 h-4 w-4" />
              <span>My Orders</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/wishlist" className="cursor-pointer">
              <Heart className="mr-2 h-4 w-4" />
              <span>Wishlist</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/profile" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Profile Settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/auth/logout" className="cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button variant="ghost" asChild className="rounded-full">
      <Link href="/auth/login">Login</Link>
    </Button>
  )
}

```


---
### FILE: ./components/ui/entry-preview-sheet.jsx
```javascript
"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function PreviewKeyValueGrid({ items = [] }) {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visibleItems.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{formatPreviewValue(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function EntryPreviewSheet({
  open,
  onOpenChange,
  title,
  description,
  summary,
  sections = [],
  footer,
}) {
  const visibleSections = sections.filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="mb-6 pr-8 text-left">
          <SheetTitle className="text-2xl font-black text-slate-950">{title}</SheetTitle>
          {description ? <SheetDescription className="text-sm text-slate-500">{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="space-y-6">
          {summary ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              {summary}
            </div>
          ) : null}

          {visibleSections.map((section) => (
            <section key={section.title} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{section.title}</h3>
                {section.description ? <p className="mt-1 text-sm text-slate-500">{section.description}</p> : null}
              </div>
              {section.children}
            </section>
          ))}

          {footer ? <div className="pt-2">{footer}</div> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

```


---
### FILE: ./components/ui/sheet.jsx
```javascript
"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref} />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-[50rem]",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-[50rem]",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

const SheetContent = React.forwardRef(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      <SheetPrimitive.Close
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

```


---
### FILE: ./components/BrandedLoginPage.jsx
```javascript
'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogIn, LogOut, Shield, Sparkles, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function BrandedLoginPage({ returnTo = '/' }) {
  const { user, error, isLoading } = useUser();
  const router = useRouter();
  const authLoginHref = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;

  useEffect(() => {
    if (user && returnTo) {
      router.replace(returnTo);
    }
  }, [user, returnTo, router]);

  useEffect(() => {
    document.cookie = 'hm-login-return-to=; Path=/; Max-Age=0; SameSite=Lax';
  }, []);

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
          <div className="relative rounded-2xl border border-border bg-card/90 p-8 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-lg font-medium text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <Card className="relative max-w-md border border-border bg-card/90 shadow-xl backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Authentication Error</h2>
            <p className="mb-6 text-muted-foreground">{error.message}</p>
            <Button className="rounded-full" asChild>
              <a href={authLoginHref}>Try Again</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-10 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <div className="h-full p-8 sm:p-10 lg:p-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-border bg-muted/40">
                  <img src="/logo.png" alt="Hanumant Marble logo" className="h-full w-full object-contain p-1.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Hanumant Marble</p>
                  <h1 className="text-2xl font-bold text-foreground">Stock access portal</h1>
                </div>
              </div>

              <Badge variant="outline" className="mb-6 rounded-full border-primary/20 bg-primary/10 px-4 py-2 text-primary">
                <Sparkles className="mr-2 h-4 w-4" />
                {returnTo.startsWith('/stock') ? 'Stock access' : 'Sign in'}
              </Badge>

              <div className="max-w-xl space-y-4">
                <p className="text-4xl font-black tracking-tight sm:text-5xl">
                  Sign in to continue.
                </p>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  You’ll be redirected to Auth0 to authenticate, then returned here automatically.
                </p>
              </div>
            </div>
          </section>

          <section className="flex h-full items-stretch rounded-[2rem] border border-border bg-card shadow-xl">
            <Card className="w-full border-0 bg-transparent shadow-none">
              <CardContent className="flex h-full flex-col justify-between p-8 sm:p-10">
                <div>
                  <div className="mb-4 inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {returnTo.startsWith('/stock') ? 'Stock login' : 'Website login'}
                  </div>

                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-foreground">Continue to your account</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Sign in securely through Auth0 and return to your requested page.
                    </p>
                  </div>

                  {user ? (
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-border bg-muted/40 p-6 text-center">
                        <div className="relative mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full border border-border bg-background">
                          {user.picture ? (
                            <img src={user.picture} alt={user.name || 'Profile'} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-primary/10">
                              <User className="h-10 w-10 text-primary" />
                            </div>
                          )}
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">You are already signed in</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                          <Link href={returnTo} className="flex items-center justify-center gap-2">
                            <ArrowRight className="h-4 w-4" />
                            Continue
                          </Link>
                        </Button>
                        <Button variant="outline" className="flex-1 rounded-full border-border hover:bg-muted/60" asChild>
                          <a href="/auth/logout" className="flex items-center justify-center gap-2">
                            <LogOut className="h-4 w-4" />
                            Log out
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-3xl border border-border bg-muted/40 p-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <LogIn className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">Secure sign-in</p>
                            <p className="text-xs text-muted-foreground">Auth0 keeps credentials and authentication hosted.</p>
                          </div>
                        </div>
                      </div>

                      <Button className="h-12 w-full rounded-full bg-primary text-base text-primary-foreground shadow-lg transition hover:bg-primary/90" asChild>
                        <a href={authLoginHref} className="flex items-center justify-center gap-2">
                          Sign in
                          <ArrowRight className="h-5 w-5" />
                        </a>
                      </Button>

                      <p className="text-center text-xs text-muted-foreground">Use the same login for stock access and the rest of the site.</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
                  <span>Hanumant Marble</span>
                  <Link href={returnTo} className="font-medium text-primary hover:underline">
                    Return target: {returnTo}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
```


---
### FILE: ./components/Layout.js
```javascript
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

```


---
### FILE: ./components/ThemeProvider.js
```javascript
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children, ...props }) {
  return (
    <NextThemesProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem 
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { useTheme } from "next-themes"

```


---
### FILE: ./components/Header.js
```javascript
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
import { usePathname } from 'next/navigation'

import { ScrollProgress } from "@/components/ui/scroll-progress"
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink } from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { CartSummary } from "@/components/ui/CartSummary"
import { useCart } from "@/contexts/CartContext"

export function Header() {
  const pathname = usePathname()
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

  if (pathname?.startsWith('/stock')) {
    return null
  }

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
              sizes="80px"
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
                          sizes="48px"
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

```


---
### FILE: ./components/GradientButton.js
```javascript
import React from "react";
import { useRouter } from "next/router";

export function GradientButton({
  className = "",
  label = "Get Your Quotation",
  href,
  ...props
}) {
  const router = useRouter();
  
  const handleClick = () => {
    if (href) {
      router.push(href);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`gradient-button ${className}`}
      {...props}
    >
      <div className="gradient-background" />
      <div className="gradient-border" />
      <div className="button-content">
        <span>{label}</span>
        <svg 
          className="arrow-icon"
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </div>
      <style jsx>{`
        .gradient-button {
          position: relative;
          height: 48px;
          padding: 0 24px;
          overflow: hidden;
          border-radius: 6px;
          border: none;
          background: #1a1a1a;
          cursor: pointer;
          transition: all 0.3s;
        }

        .gradient-background {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, #a78bfa, #818cf8, #6366f1);
          opacity: 0.7;
          transition: opacity 0.5s;
        }

        .gradient-border {
          position: absolute;
          inset: -2px;
          border-radius: 8px;
          background: linear-gradient(to right, #a78bfa, #818cf8, #6366f1);
          opacity: 0;
          filter: blur(8px);
          transition: all 0.5s;
        }

        .button-content {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 500;
          color: white;
        }

        .arrow-icon {
          transition: transform 0.3s;
        }

        .gradient-button:hover .gradient-background {
          opacity: 0.9;
        }

        .gradient-button:hover .gradient-border {
          opacity: 1;
          filter: blur(4px);
        }

        .gradient-button:hover .arrow-icon {
          transform: translate(2px, -2px);
        }
      `}</style>
    </button>
  );
}

```


---
### FILE: ./components/Footer.js
```javascript
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

```


---
### FILE: ./scripts/test-whatsapp-arrival-setup.mjs
```javascript
#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runSetup() {
  const itemRows = await sql`SELECT id, sku, name FROM stock_items ORDER BY id ASC LIMIT 1`;
  const existingItem = itemRows[0];

  if (!existingItem) {
    throw new Error('No stock_items found. Seed data first.');
  }

  await sql`UPDATE stock_items SET department = 'Marble', updated_at = NOW() WHERE id = ${existingItem.id}`;

  const marbleRows = await sql`
    INSERT INTO stock_app_users (
      auth0_sub, name, phone, email, role, department, status,
      can_manage_users, can_approve_changes, can_view_dashboard, created_by
    ) VALUES (
      ${null}, ${'Test Sales Marble'}, ${'9990001111'}, ${'sales.marble.test@stock.local'},
      ${'salesperson'}, ${'Marble'}, ${'active'},
      ${false}, ${false}, ${true}, ${'test-setup-script'}
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      status = EXCLUDED.status,
      can_manage_users = EXCLUDED.can_manage_users,
      can_approve_changes = EXCLUDED.can_approve_changes,
      can_view_dashboard = EXCLUDED.can_view_dashboard,
      updated_at = NOW()
    RETURNING id, name, phone, email, role, department
  `;

  const graniteRows = await sql`
    INSERT INTO stock_app_users (
      auth0_sub, name, phone, email, role, department, status,
      can_manage_users, can_approve_changes, can_view_dashboard, created_by
    ) VALUES (
      ${null}, ${'Test Sales Granite'}, ${'9990002222'}, ${'sales.granite.test@stock.local'},
      ${'salesperson'}, ${'Granite'}, ${'active'},
      ${false}, ${false}, ${true}, ${'test-setup-script'}
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      department = EXCLUDED.department,
      status = EXCLUDED.status,
      can_manage_users = EXCLUDED.can_manage_users,
      can_approve_changes = EXCLUDED.can_approve_changes,
      can_view_dashboard = EXCLUDED.can_view_dashboard,
      updated_at = NOW()
    RETURNING id, name, phone, email, role, department
  `;

  const shipmentNumber = `INB-E2E-${Date.now()}`;
  const shipmentRows = await sql`
    INSERT INTO stock_inbound_shipments (
      shipment_number, supplier_id, arrival_date, submitted_at, submitted_by_user_id,
      approval_status, status, total_whole_qty, total_broken_qty, received_by,
      recorded_by_user_id, notes, created_by
    ) VALUES (
      ${shipmentNumber}, ${null}, NOW(), NOW(), ${null},
      ${'pending'}, ${'submitted'}, ${12}, ${0}, ${'test-e2e'},
      ${null}, ${'Controlled e2e test shipment'}, ${'test-setup-script'}
    )
    RETURNING id, shipment_number, approval_status, status
  `;

  const shipment = shipmentRows[0];

  await sql`
    INSERT INTO stock_inbound_shipment_items (
      inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty,
      rejected_qty, unit_cost, landed_cost, notes
    ) VALUES (
      ${shipment.id}, ${existingItem.id}, ${12}, ${12}, ${0},
      ${0}, ${100}, ${100}, ${'Marble department controlled test row'}
    )
  `;

  const departmentMatches = await sql`
    SELECT id, name, email, phone,
           COALESCE(NULLIF(TRIM(department), ''), 'General') AS department
    FROM stock_app_users
    WHERE status = 'active'
      AND role = 'salesperson'
      AND COALESCE(NULLIF(TRIM(department), ''), 'General') = 'Marble'
    ORDER BY id ASC
  `;

  const ignoredSalespeople = await sql`
    SELECT id, name, email, phone,
           COALESCE(NULLIF(TRIM(department), ''), 'General') AS department
    FROM stock_app_users
    WHERE status = 'active'
      AND role = 'salesperson'
      AND COALESCE(NULLIF(TRIM(department), ''), 'General') <> 'Marble'
    ORDER BY id ASC
  `;

  console.log(JSON.stringify({
    setup: {
      marbleUser: marbleRows[0],
      graniteUser: graniteRows[0],
      itemUsed: { id: existingItem.id, sku: existingItem.sku, name: existingItem.name, department: 'Marble' },
      inboundShipment: shipment,
    },
    departmentMatchQuery: {
      inputDepartments: ['Marble'],
      matchedSalespeople: departmentMatches,
      ignoredSalespeople,
    },
  }, null, 2));
}

runSetup().catch((error) => {
  console.error('Setup failed:', error.message || error);
  process.exit(1);
});

```


---
### FILE: ./scripts/verify-fresh-seed.js
```javascript
#!/usr/bin/env node

/**
 * Database Verification Script
 * Confirms seeded data is present and accessible
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function verifyDatabase() {
  console.log('🔍 Verifying Fresh Seed Data...\n');

  try {
    // Check users
    const users = await sql`
      SELECT role, COUNT(*) as count FROM stock_app_users 
      GROUP BY role ORDER BY role
    `;
    console.log('👥 Users by Role:');
    for (const row of users) {
      console.log(`   • ${row.role}: ${row.count}`);
    }

    // Check inbound shipments
    const inbound = await sql`
      SELECT approval_status, COUNT(*) as count 
      FROM stock_inbound_shipments 
      GROUP BY approval_status 
      ORDER BY approval_status
    `;
    console.log('\n📥 Inbound Shipments by Status:');
    for (const row of inbound) {
      console.log(`   • ${row.approval_status}: ${row.count}`);
    }

    // Check outbound shipments
    const outbound = await sql`
      SELECT approval_status, COUNT(*) as count 
      FROM stock_outbound_shipments 
      GROUP BY approval_status 
      ORDER BY approval_status
    `;
    console.log('\n📤 Outbound Shipments by Status:');
    for (const row of outbound) {
      console.log(`   • ${row.approval_status}: ${row.count}`);
    }

    // Check recent inbound shipments
    const recent = await sql`
      SELECT 
        shipment_number, 
        approval_status, 
        arrival_date, 
        total_whole_qty,
        total_broken_qty
      FROM stock_inbound_shipments 
      ORDER BY arrival_date DESC
      LIMIT 6
    `;
    console.log('\n📋 Recent Inbound Arrivals:');
    for (const row of recent) {
      const days_ago = Math.floor((new Date() - new Date(row.arrival_date)) / (1000 * 60 * 60 * 24));
      console.log(`   • ${row.shipment_number} [${row.approval_status}] - ${row.total_whole_qty} good + ${row.total_broken_qty} broken (${days_ago}d ago)`);
    }

    // Check totals
    const totals = await sql`
      SELECT 
        (SELECT COUNT(*) FROM stock_brands) as brands,
        (SELECT COUNT(*) FROM stock_types) as types,
        (SELECT COUNT(*) FROM stock_sizes) as sizes,
        (SELECT COUNT(*) FROM stock_locations) as locations,
        (SELECT COUNT(*) FROM stock_suppliers) as suppliers,
        (SELECT COUNT(*) FROM stock_customers) as customers,
        (SELECT COUNT(*) FROM stock_items) as items,
        (SELECT COUNT(*) FROM stock_inbound_shipments) as inbound,
        (SELECT COUNT(*) FROM stock_outbound_shipments) as outbound,
        (SELECT COUNT(*) FROM stock_timeline_events) as events
    `;

    console.log('\n📊 Master Data Summary:');
    const t = totals[0];
    console.log(`   • Brands: ${t.brands}`);
    console.log(`   • Types: ${t.types}`);
    console.log(`   • Sizes: ${t.sizes}`);
    console.log(`   • Locations: ${t.locations}`);
    console.log(`   • Stock Items: ${t.items}`);
    console.log(`   • Inbound Shipments: ${t.inbound}`);
    console.log(`   • Outbound Shipments: ${t.outbound}`);
    console.log(`   • Timeline Events: ${t.events}`);

    console.log('\n✅ Verification complete! Database is ready for testing.');
    console.log('\n🚀 Next: npm run dev\n');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyDatabase();

```


---
### FILE: ./scripts/verify-seed.js
```javascript
#!/usr/bin/env node

/**
 * Verify Stock Database Seeding Status
 * Shows what data is currently in the database
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function verifyDatabase() {
  console.log('\n🔍 Stock Database Verification\n');
  console.log('📊 Current Database Statistics:\n');

  try {
    const tables = [
      ['stock_brands', 'Brands'],
      ['stock_types', 'Types'],
      ['stock_sizes', 'Sizes'],
      ['stock_locations', 'Locations'],
      ['stock_suppliers', 'Suppliers'],
      ['stock_customers', 'Customers'],
      ['stock_transporters', 'Transporters'],
      ['stock_vehicles', 'Vehicles'],
      ['stock_sales_people', 'Sales People'],
      ['stock_app_users', 'Users'],
      ['stock_items', 'Stock Items'],
      ['stock_purchase_orders', 'Purchase Orders'],
      ['stock_inbound_shipments', 'Inbound Shipments'],
      ['stock_sales_orders', 'Sales Orders'],
      ['stock_outbound_shipments', 'Outbound Shipments'],
      ['stock_change_requests', 'Change Requests'],
      ['stock_timeline_events', 'Timeline Events'],
      ['stock_notifications', 'Notifications'],
    ];

    let totalRecords = 0;

    for (const [tableName, displayName] of tables) {
      try {
        const result = await sql`SELECT COUNT(*) as count FROM ${sql(tableName)}`;
        const count = result[0].count;
        totalRecords += count;
        const icon = count > 0 ? '✅' : '⚠️ ';
        console.log(`   ${icon} ${displayName.padEnd(22)}: ${count} record${count !== 1 ? 's' : ''}`);
      } catch (err) {
        console.log(`   ❌ ${displayName.padEnd(22)}: [error accessing]`);
      }
    }

    // Additional insights
    console.log('\n📈 Workflow Status Insights:\n');

    try {
      const inboundStatus = await sql`
        SELECT approval_status, COUNT(*) as count
        FROM stock_inbound_shipments
        GROUP BY approval_status
        ORDER BY count DESC
      `;
      console.log('   Inbound Shipments Status:');
      for (const row of inboundStatus) {
        console.log(`      • ${row.approval_status || 'unknown'}: ${row.count}`);
      }
    } catch (e) {}

    try {
      const outboundStatus = await sql`
        SELECT approval_status, COUNT(*) as count
        FROM stock_outbound_shipments
        GROUP BY approval_status
        ORDER BY count DESC
      `;
      console.log('\n   Outbound Shipments Status:');
      for (const row of outboundStatus) {
        console.log(`      • ${row.approval_status || 'unknown'}: ${row.count}`);
      }
    } catch (e) {}

    try {
      const usersByRole = await sql`
        SELECT role, COUNT(*) as count
        FROM stock_app_users
        GROUP BY role
        ORDER BY role
      `;
      console.log('\n   Users by Role:');
      for (const row of usersByRole) {
        console.log(`      • ${row.role}: ${row.count}`);
      }
    } catch (e) {}

    console.log(`\n📊 Total Records in Database: ${totalRecords}\n`);

    if (totalRecords > 100) {
      console.log('✨ Database is seeded and ready for testing!\n');
      console.log('🎯 Next Steps:');
      console.log('   1. Start the dev server: npm run dev');
      console.log('   2. Login with test credentials');
      console.log('   3. Test role-based access control');
      console.log('   4. Verify monthly graph visualizations\n');
    } else {
      console.log('⚠️  Database may not be fully seeded.\n');
    }

  } catch (error) {
    console.error('❌ Error verifying database:', error.message);
    process.exit(1);
  }
}

verifyDatabase();

```


---
### FILE: ./scripts/migrate-salesperson-role.mjs
```javascript
#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateSalespersonRole() {
  try {
    await sql`
      DO $$
      DECLARE
        role_constraint_name TEXT;
      BEGIN
        -- Explicitly drop the known constraint name first to avoid duplicate-constraint errors.
        ALTER TABLE stock_app_users
        DROP CONSTRAINT IF EXISTS stock_app_users_role_check;

        -- Drop any other legacy role check constraints if present.
        SELECT c.conname
        INTO role_constraint_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'stock_app_users'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%role IN%'
        LIMIT 1;

        IF role_constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE stock_app_users DROP CONSTRAINT %I', role_constraint_name);
        END IF;

        UPDATE stock_app_users
        SET role = CASE
          WHEN role = 'admin' THEN 'admin'
          WHEN role IN ('manager', 'stock_approver') THEN 'manager'
          WHEN role IN ('salesperson', 'sales_person', 'sales') THEN 'salesperson'
          ELSE 'stock_maintainer'
        END;

        UPDATE stock_app_users
        SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
            can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
            can_view_dashboard = COALESCE(can_view_dashboard, TRUE);

        ALTER TABLE stock_app_users
        ADD CONSTRAINT stock_app_users_role_check
        CHECK (role IN ('admin', 'manager', 'stock_maintainer', 'salesperson'));
      END $$;
    `;

    console.log('Salesperson role migration completed successfully.');
  } catch (error) {
    console.error('Failed to run salesperson role migration:', error.message);
    process.exit(1);
  }
}

migrateSalespersonRole();

```


---
### FILE: ./scripts/build-admin-ui-context.mjs
```javascript
#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const outputFile = path.join(projectRoot, 'admin-ui-context.txt');

const filesToInclude = [
  {
    label: 'Main Admin view',
    candidates: ['app/stock/admin/page.js'],
  },
  {
    label: 'Navigation and global wrapper',
    candidates: ['app/stock/layout.js'],
  },
  {
    label: 'Admin dashboard API data structure',
    candidates: ['app/api/stock/admin/dashboard/route.js'],
  },
  {
    label: 'Tailwind theme and palette',
    candidates: ['tailwind.config.js'],
  },
  {
    label: 'Base styles',
    candidates: ['app/globals.css', 'styles/globals.css'],
  },
];

async function findExistingFile(candidates) {
  for (const relativePath of candidates) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
      await fs.access(absolutePath);
      return relativePath;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function readSection(relativePath, label) {
  const absolutePath = path.join(projectRoot, relativePath);
  const content = await fs.readFile(absolutePath, 'utf8');

  return [
    `=== ${label} ===`,
    `File: ${relativePath}`,
    '',
    content.trimEnd(),
    '',
  ].join('\n');
}

async function main() {
  const sections = [];
  const missing = [];

  for (const entry of filesToInclude) {
    const existingFile = await findExistingFile(entry.candidates);

    if (!existingFile) {
      missing.push(entry.candidates[0]);
      continue;
    }

    const section = await readSection(existingFile, entry.label);
    sections.push(section);
  }

  const header = [
    'Admin UI Context Bundle',
    `Generated: ${new Date().toISOString()}`,
    '',
  ].join('\n');

  const missingBlock = missing.length
    ? [
        '=== Missing Files ===',
        ...missing.map((file) => `- ${file}`),
        '',
      ].join('\n')
    : '';

  const output = [header, missingBlock, ...sections].filter(Boolean).join('\n');
  await fs.writeFile(outputFile, output, 'utf8');

  console.log(`Created ${path.relative(projectRoot, outputFile)} with ${sections.length} section(s).`);
  if (missing.length) {
    console.warn(`Missing ${missing.length} file(s): ${missing.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Failed to build admin-ui-context.txt');
  console.error(error);
  process.exitCode = 1;
});
```


---
### FILE: ./scripts/migrate-notification-read-columns.js
```javascript
#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateNotificationReadColumns() {
  try {
    await sql`
      ALTER TABLE stock_notifications
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE
    `;

    await sql`
      ALTER TABLE stock_notifications
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP
    `;

    console.log('Notification read columns migration completed successfully.');
  } catch (error) {
    console.error('Failed to run notification read columns migration:', error.message);
    process.exit(1);
  }
}

migrateNotificationReadColumns();

```


---
### FILE: ./scripts/seed-stock-data.js
```javascript
#!/usr/bin/env node

/**
 * Stock Management Database Seed Script
 * 
 * This script seeds the stock database with comprehensive test data including:
 * - Master data (brands, types, sizes, locations, suppliers, customers, transporters)
 * - Users with different roles (admin, manager, stock_maintainer, salesperson)
 * - Stock items (marble/tile products)
 * - Purchase orders and inbound shipments with various statuses
 * - Sales orders and outbound shipments
 * - Inventory movements and lots
 * - Change requests and timeline events for visualization
 * 
 * Run with: node scripts/seed-stock-data.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('\nAdd it to your .env.local file:');
  console.log('DATABASE_URL=your_neon_connection_string\n');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Utility to generate dates throughout the current month
function getDateInMonth(dayOffset) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  return new Date(year, month, Math.min(dayOffset, 28)); // Safe for all months
}

// Utility to add hours to a date
function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

async function seedStockDatabase() {
  console.log('🌱 Starting stock database seeding...\n');

  try {
    // ===== FIX ROLE CONSTRAINT FIRST =====
    console.log('🔧 Fixing role constraint to allow current 4-role model...');
    try {
      await sql`
        DO $$
        DECLARE
          role_constraint_name TEXT;
        BEGIN
          SELECT c.conname
          INTO role_constraint_name
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'stock_app_users'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%role IN%'
          LIMIT 1;

          IF role_constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE stock_app_users DROP CONSTRAINT %I', role_constraint_name);
          END IF;

          UPDATE stock_app_users
          SET role = CASE
            WHEN role = 'admin' THEN 'admin'
            WHEN role IN ('manager', 'stock_approver') THEN 'manager'
            WHEN role IN ('salesperson', 'sales_person', 'sales') THEN 'salesperson'
            ELSE 'stock_maintainer'
          END;

          UPDATE stock_app_users
          SET can_manage_users = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
              can_approve_changes = CASE WHEN role IN ('admin', 'manager') THEN TRUE ELSE FALSE END,
              can_view_dashboard = COALESCE(can_view_dashboard, TRUE);

          ALTER TABLE stock_app_users
          ADD CONSTRAINT stock_app_users_role_check
          CHECK (role IN ('admin', 'manager', 'stock_maintainer', 'salesperson'));
        END $$;
      `;
      console.log('✅ Role constraint fixed\n');
    } catch (err) {
      console.log('⏭️  Role constraint already correct, continuing...\n');
    }
    // ===== SEED MASTER DATA =====
    console.log('📋 Seeding master data...');

    // Brands
    const brands = [
      { name: 'Kajaria', name_hi: 'काजरिया', description: 'Premium Indian tile brand' },
      { name: 'Somany', name_hi: 'सोमनी', description: 'Leading tile manufacturer' },
      { name: 'Brillant', name_hi: 'ब्रिलिएंट', description: 'Quality marble tiles' },
      { name: 'Nitco', name_hi: 'नित्को', description: 'Premium vitrified tiles' },
      { name: 'Rak Ceramics', name_hi: 'राक सिरामिक्स', description: 'International quality' },
    ];

    const brandIds = [];
    for (const brand of brands) {
      const result = await sql`
        INSERT INTO stock_brands (name, name_hi, description)
        VALUES (${brand.name}, ${brand.name_hi}, ${brand.description})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `;
      if (result.length > 0) brandIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${brandIds.length} brands`);

    // Types
    const types = [
      { name: 'Vitrified', name_hi: 'विट्रिफाइड', description: 'Vitrified tiles' },
      { name: 'Marble', name_hi: 'मार्बल', description: 'Natural marble' },
      { name: 'Granite', name_hi: 'ग्रेनाइट', description: 'Granite tiles' },
      { name: 'Ceramic', name_hi: 'सिरेमिक', description: 'Ceramic tiles' },
      { name: 'Porcelain', name_hi: 'पोर्सिलेन', description: 'Porcelain tiles' },
    ];

    const typeIds = [];
    for (const type of types) {
      const result = await sql`
        INSERT INTO stock_types (name, name_hi, description)
        VALUES (${type.name}, ${type.name_hi}, ${type.description})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `;
      if (result.length > 0) typeIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${typeIds.length} types`);

    // Sizes
    const sizes = [
      { label: '600x600', width_mm: 600, length_mm: 600, thickness_mm: 20 },
      { label: '800x800', width_mm: 800, length_mm: 800, thickness_mm: 20 },
      { label: '1200x600', width_mm: 1200, length_mm: 600, thickness_mm: 20 },
      { label: '300x600', width_mm: 300, length_mm: 600, thickness_mm: 10 },
      { label: '600x1200', width_mm: 600, length_mm: 1200, thickness_mm: 20 },
    ];

    const sizeIds = [];
    for (const size of sizes) {
      const result = await sql`
        INSERT INTO stock_sizes (label, width_mm, length_mm, thickness_mm)
        VALUES (${size.label}, ${size.width_mm}, ${size.length_mm}, ${size.thickness_mm})
        ON CONFLICT (label) DO UPDATE SET thickness_mm = EXCLUDED.thickness_mm
        RETURNING id
      `;
      if (result.length > 0) sizeIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${sizeIds.length} sizes`);

    // Locations
    const locations = [
      { name: 'Main Warehouse', location_type: 'warehouse', address: 'Industrial Area, Delhi', contact_name: 'Rajesh', contact_phone: '9876543210' },
      { name: 'Showroom Delhi', location_type: 'showroom', address: 'Connaught Place, Delhi', contact_name: 'Priya', contact_phone: '9876543211' },
      { name: 'Yard 1', location_type: 'yard', address: 'Outside Delhi', contact_name: 'Kumar', contact_phone: '9876543212' },
      { name: 'In Transit', location_type: 'in_transit', address: 'Various', contact_name: 'Driver', contact_phone: 'N/A' },
      { name: 'Customer Site A', location_type: 'customer_site', address: 'Gurgaon', contact_name: 'Customer', contact_phone: '9876543213' },
    ];

    const locationIds = [];
    for (const loc of locations) {
      const result = await sql`
        INSERT INTO stock_locations (name, location_type, address, contact_name, contact_phone)
        VALUES (${loc.name}, ${loc.location_type}, ${loc.address}, ${loc.contact_name}, ${loc.contact_phone})
        ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address
        RETURNING id
      `;
      if (result.length > 0) locationIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${locationIds.length} locations`);

    // Suppliers
    const suppliers = [
      { name: 'Kajaria Distributor', gst_number: '07AABCU1234F1Z0', phone: '9876543220', email: 'kajaria@supplier.com', address: 'Noida, UP' },
      { name: 'Somany Supplier', gst_number: '27AABCS1234F1Z0', phone: '9876543221', email: 'somany@supplier.com', address: 'Mumbai, MH' },
      { name: 'Brillant Tiles', gst_number: '07AABCTS1234F1Z0', phone: '9876543222', email: 'brillant@supplier.com', address: 'Delhi' },
      { name: 'Premium Imports', gst_number: '07AABCU2234F1Z0', phone: '9876543223', email: 'premium@supplier.com', address: 'Bangalore, KA' },
    ];

    const supplierIds = [];
    for (const supplier of suppliers) {
      const result = await sql`
        INSERT INTO stock_suppliers (name, gst_number, phone, email, address)
        VALUES (${supplier.name}, ${supplier.gst_number}, ${supplier.phone}, ${supplier.email}, ${supplier.address})
        ON CONFLICT (name) DO UPDATE SET gst_number = EXCLUDED.gst_number
        RETURNING id
      `;
      if (result.length > 0) supplierIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${supplierIds.length} suppliers`);

    // Customers
    const customers = [
      { name: 'John Contractor', phone: '8765432100', whatsapp_phone: '8765432100', email: 'john@contractor.com', company_name: 'John Constructions', billing_address: 'Delhi', gst_number: '07AABCU3234F1Z0' },
      { name: 'Priya Interiors', phone: '8765432101', whatsapp_phone: '8765432101', email: 'priya@interiors.com', company_name: 'Priya Interiors', billing_address: 'Gurgaon', gst_number: '07AABCU4234F1Z0' },
      { name: 'Builder\'s Hub', phone: '8765432102', whatsapp_phone: '8765432102', email: 'builders@hub.com', company_name: 'Builder\'s Hub', billing_address: 'Noida', gst_number: '07AABCU5234F1Z0' },
      { name: 'Retail Outlet A', phone: '8765432103', whatsapp_phone: '8765432103', email: 'retail@outlet.com', company_name: 'Retail Outlet A', billing_address: 'Delhi', gst_number: '07AABCU6234F1Z0' },
      { name: 'Corporate Buyer', phone: '8765432104', whatsapp_phone: '8765432104', email: 'corporate@buyer.com', company_name: 'Corporate Buyer Ltd', billing_address: 'Bangalore', gst_number: '07AABCU7234F1Z0' },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const result = await sql`
        INSERT INTO stock_customers (name, phone, whatsapp_phone, email, company_name, billing_address, gst_number)
        VALUES (${customer.name}, ${customer.phone}, ${customer.whatsapp_phone}, ${customer.email}, ${customer.company_name}, ${customer.billing_address}, ${customer.gst_number})
        RETURNING id
      `;
      if (result.length > 0) customerIds.push(result[0].id);
    }
    console.log(`✅ Created ${customerIds.length} customers`);

    // Transporters
    const transporters = [
      { name: 'Fast Transport', contact_name: 'Ravi', phone: '7654321000', gst_number: '07AABCT1234F1Z0', address: 'Delhi', vehicle_number: 'DL01AB1234' },
      { name: 'Reliable Haulers', contact_name: 'Vikram', phone: '7654321001', gst_number: '07AABCT2234F1Z0', address: 'Noida', vehicle_number: 'UP14MN5678' },
      { name: 'Express Logistics', contact_name: 'Amit', phone: '7654321002', gst_number: '07AABCT3234F1Z0', address: 'Gurgaon', vehicle_number: 'HR26PH9012' },
      { name: 'Local Movers', contact_name: 'Suresh', phone: '7654321003', gst_number: '07AABCT4234F1Z0', address: 'Delhi', vehicle_number: 'DL09XY3456' },
    ];

    const transporterIds = [];
    for (const transporter of transporters) {
      const result = await sql`
        INSERT INTO stock_transporters (name, contact_name, phone, gst_number, address)
        VALUES (${transporter.name}, ${transporter.contact_name}, ${transporter.phone}, ${transporter.gst_number}, ${transporter.address})
        ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone
        RETURNING id
      `;
      if (result.length > 0) transporterIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${transporterIds.length} transporters`);

    // Vehicles
    const vehicleData = [
      { vehicle_number: 'DL01AB1234', vehicle_type: 'Truck', driver_name: 'Harish', driver_phone: '9876543300', transporter_id: transporterIds[0] },
      { vehicle_number: 'UP14MN5678', vehicle_type: 'Truck', driver_name: 'Sanjay', driver_phone: '9876543301', transporter_id: transporterIds[1] },
      { vehicle_number: 'HR26PH9012', vehicle_type: 'Truck', driver_name: 'Mohit', driver_phone: '9876543302', transporter_id: transporterIds[2] },
      { vehicle_number: 'DL09XY3456', vehicle_type: 'Truck', driver_name: 'Deepak', driver_phone: '9876543303', transporter_id: transporterIds[3] },
    ];

    const vehicleIds = [];
    for (const vehicle of vehicleData) {
      const result = await sql`
        INSERT INTO stock_vehicles (vehicle_number, vehicle_type, driver_name, driver_phone, transporter_id)
        VALUES (${vehicle.vehicle_number}, ${vehicle.vehicle_type}, ${vehicle.driver_name}, ${vehicle.driver_phone}, ${vehicle.transporter_id})
        ON CONFLICT (vehicle_number) DO UPDATE SET driver_name = EXCLUDED.driver_name
        RETURNING id
      `;
      if (result.length > 0) vehicleIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${vehicleIds.length} vehicles`);

    // Sales People
    const salesPeople = [
      { name: 'Rajesh Kumar', phone: '9876543400', email: 'rajesh@sales.com', whatsapp_phone: '9876543400' },
      { name: 'Deepika Singh', phone: '9876543401', email: 'deepika@sales.com', whatsapp_phone: '9876543401' },
      { name: 'Arjun Patel', phone: '9876543402', email: 'arjun@sales.com', whatsapp_phone: '9876543402' },
      { name: 'Neha Sharma', phone: '9876543403', email: 'neha@sales.com', whatsapp_phone: '9876543403' },
    ];

    const salesPeopleIds = [];
    for (const person of salesPeople) {
      const result = await sql`
        INSERT INTO stock_sales_people (name, phone, email, whatsapp_phone)
        VALUES (${person.name}, ${person.phone}, ${person.email}, ${person.whatsapp_phone})
        RETURNING id
      `;
      if (result.length > 0) salesPeopleIds.push(result[0].id);
    }
    console.log(`✅ Created ${salesPeopleIds.length} sales people`);

    // ===== SEED USERS WITH DIFFERENT ROLES =====
    console.log('\n👥 Seeding users with role-based access...');

    const users = [
      // Admin users
      { name: 'Admin User', phone: '9111111111', email: 'admin@stock.com', role: 'admin', status: 'active' },
      { name: 'Super Admin', phone: '9111111112', email: 'superadmin@stock.com', role: 'admin', status: 'active' },
      // Manager users
      { name: 'Manager One', phone: '9222222221', email: 'manager1@stock.com', role: 'manager', status: 'active' },
      { name: 'Manager Two', phone: '9222222222', email: 'manager2@stock.com', role: 'manager', status: 'active' },
      // Stock Maintainer
      { name: 'Stock Maintainer A', phone: '9333333331', email: 'maintainer1@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer B', phone: '9333333332', email: 'maintainer2@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer C', phone: '9333333333', email: 'maintainer3@stock.com', role: 'stock_maintainer', status: 'active' },
      // Salesperson users
      { name: 'Salesperson One', phone: '9444444441', email: 'salesperson1@stock.com', role: 'salesperson', status: 'active' },
      { name: 'Salesperson Two', phone: '9444444442', email: 'salesperson2@stock.com', role: 'salesperson', status: 'active' },
    ];

    const userIds = [];
    for (const user of users) {
      try {
        const result = await sql`
          INSERT INTO stock_app_users (name, phone, email, role, status)
          VALUES (${user.name}, ${user.phone}, ${user.email}, ${user.role}, ${user.status})
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) userIds.push(result[0].id);
      } catch (err) {
        // Skip if user already exists or constraint violation
        console.log(`⏭️  Skipping user ${user.email} (may already exist)`);
      }
    }
    console.log(`✅ Created/found ${userIds.length} users (2 admins, 2 managers, 3 maintainers, 2 salespeople)`);

    // ===== SEED STOCK ITEMS =====
    console.log('\n📦 Seeding stock items...');

    const items = [
      { sku: 'KAJ-600-WHT', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[0], name: 'Kajaria White 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 450, selling_price: 599 },
      { sku: 'KAJ-800-BLK', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[1], name: 'Kajaria Black 800x800', tiles_per_box: 2, pieces_per_box: 2, purchase_price: 850, selling_price: 1199 },
      { sku: 'SOM-600-GRY', brand_id: brandIds[1], type_id: typeIds[0], size_id: sizeIds[0], name: 'Somany Grey 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 400, selling_price: 549 },
      { sku: 'BRL-MBL-CRM', brand_id: brandIds[2], type_id: typeIds[1], size_id: sizeIds[2], name: 'Brillant Marble Cream 1200x600', tiles_per_box: 2, pieces_per_box: 4, purchase_price: 1200, selling_price: 1799 },
      { sku: 'NIT-GRN-300', brand_id: brandIds[3], type_id: typeIds[0], size_id: sizeIds[3], name: 'Nitco Green 300x600', tiles_per_box: 8, pieces_per_box: 8, purchase_price: 180, selling_price: 299 },
      { sku: 'RAK-PORT-GOLD', brand_id: brandIds[4], type_id: typeIds[2], size_id: sizeIds[0], name: 'Rak Granite Gold 600x600', tiles_per_box: 4, pieces_per_box: 4, purchase_price: 650, selling_price: 899 },
      { sku: 'KAJ-BEIGE-1200', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[4], name: 'Kajaria Beige 600x1200', tiles_per_box: 2, pieces_per_box: 2, purchase_price: 900, selling_price: 1299 },
      { sku: 'SOM-BLUE-300', brand_id: brandIds[1], type_id: typeIds[3], size_id: sizeIds[3], name: 'Somany Blue 300x600', tiles_per_box: 8, pieces_per_box: 8, purchase_price: 220, selling_price: 349 },
    ];

    const itemIds = [];
    for (const item of items) {
      const result = await sql`
        INSERT INTO stock_items (
          sku, brand_id, type_id, size_id, name, tiles_per_box, pieces_per_box,
          purchase_price, selling_price, unit_of_measure, reorder_level
        ) VALUES (
          ${item.sku}, ${item.brand_id}, ${item.type_id}, ${item.size_id}, ${item.name},
          ${item.tiles_per_box}, ${item.pieces_per_box}, ${item.purchase_price}, ${item.selling_price}, 'box', 20
        )
        ON CONFLICT (sku) DO UPDATE SET selling_price = EXCLUDED.selling_price
        RETURNING id
      `;
      if (result.length > 0) itemIds.push(result[0].id);
    }
    console.log(`✅ Created/updated ${itemIds.length} stock items`);

    // ===== SEED PURCHASE ORDERS & INBOUND SHIPMENTS =====
    console.log('\n📥 Seeding purchase orders and inbound shipments with various statuses...');

    // Check if shipments already exist
    const existingShipments = await sql`SELECT COUNT(*) as count FROM stock_inbound_shipments`;
    if (existingShipments[0].count > 0) {
      console.log(`⏭️  Skipping shipment seeding (${existingShipments[0].count} shipments already exist)`);
    } else {

    // Create scenarios for different statuses
    const purchaseScenarios = [
      // Approved shipment (arrived 5 days ago)
      {
        po_number: 'PO-2026-001',
        supplier_id: supplierIds[0],
        order_date: getDateInMonth(1),
        expected_arrival_date: getDateInMonth(3),
        status: 'received',
        total_amount: 45000,
        shipment_status: 'received',
        approval_status: 'approved',
        shipment_number: 'INBOUND-001',
        arrival_date: getDateInMonth(5),
        submitted_date: getDateInMonth(5),
        reviewed_date: getDateInMonth(5),
        approved_date: addHours(getDateInMonth(5), 2),
        submitted_by: userIds[4], // maintainer
        reviewed_by: userIds[2], // manager
        approved_by: userIds[0], // admin
        items: [
          { item_id: itemIds[0], ordered_qty: 100, received_whole: 95, received_broken: 5 },
          { item_id: itemIds[2], ordered_qty: 80, received_whole: 80, received_broken: 0 },
        ],
      },
      // Pending approval (submitted today)
      {
        po_number: 'PO-2026-002',
        supplier_id: supplierIds[1],
        order_date: getDateInMonth(2),
        expected_arrival_date: getDateInMonth(4),
        status: 'draft',
        total_amount: 38500,
        shipment_status: 'submitted',
        approval_status: 'pending',
        shipment_number: 'INBOUND-002',
        arrival_date: getDateInMonth(8),
        submitted_date: getDateInMonth(8),
        submitted_by: userIds[5], // maintainer
        items: [
          { item_id: itemIds[1], ordered_qty: 50, received_whole: 50, received_broken: 0 },
          { item_id: itemIds[4], ordered_qty: 120, received_whole: 120, received_broken: 0 },
        ],
      },
      // Changes requested (submitted 3 days ago, manager requested changes)
      {
        po_number: 'PO-2026-003',
        supplier_id: supplierIds[2],
        order_date: getDateInMonth(3),
        expected_arrival_date: getDateInMonth(7),
        status: 'draft',
        total_amount: 52300,
        shipment_status: 'submitted',
        approval_status: 'changes_requested',
        shipment_number: 'INBOUND-003',
        arrival_date: getDateInMonth(6),
        submitted_date: getDateInMonth(6),
        reviewed_date: getDateInMonth(6),
        submitted_by: userIds[4],
        reviewed_by: userIds[3], // manager
        approval_notes: 'Please verify the broken quantity count',
        items: [
          { item_id: itemIds[3], ordered_qty: 40, received_whole: 35, received_broken: 5 },
          { item_id: itemIds[5], ordered_qty: 60, received_whole: 58, received_broken: 2 },
        ],
      },
      // Rejected (submitted 2 days ago)
      {
        po_number: 'PO-2026-004',
        supplier_id: supplierIds[0],
        order_date: getDateInMonth(4),
        expected_arrival_date: getDateInMonth(8),
        status: 'draft',
        total_amount: 35000,
        shipment_status: 'submitted',
        approval_status: 'rejected',
        shipment_number: 'INBOUND-004',
        arrival_date: getDateInMonth(7),
        submitted_date: getDateInMonth(7),
        reviewed_date: getDateInMonth(7),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        approval_notes: 'Goods damaged during transit, requesting replacement shipment',
        items: [
          { item_id: itemIds[2], ordered_qty: 100, received_whole: 60, received_broken: 40 },
        ],
      },
      // Approved (arrived yesterday)
      {
        po_number: 'PO-2026-005',
        supplier_id: supplierIds[3],
        order_date: getDateInMonth(9),
        expected_arrival_date: getDateInMonth(11),
        status: 'received',
        total_amount: 42000,
        shipment_status: 'received',
        approval_status: 'approved',
        shipment_number: 'INBOUND-005',
        arrival_date: getDateInMonth(10),
        submitted_date: getDateInMonth(10),
        reviewed_date: getDateInMonth(10),
        approved_date: addHours(getDateInMonth(10), 1),
        submitted_by: userIds[4],
        reviewed_by: userIds[3],
        approved_by: userIds[1], // admin
        items: [
          { item_id: itemIds[6], ordered_qty: 75, received_whole: 75, received_broken: 0 },
          { item_id: itemIds[7], ordered_qty: 90, received_whole: 88, received_broken: 2 },
        ],
      },
      // Pending review (submitted in middle of month)
      {
        po_number: 'PO-2026-006',
        supplier_id: supplierIds[1],
        order_date: getDateInMonth(12),
        expected_arrival_date: getDateInMonth(16),
        status: 'draft',
        total_amount: 48000,
        shipment_status: 'submitted',
        approval_status: 'reviewed',
        shipment_number: 'INBOUND-006',
        arrival_date: getDateInMonth(15),
        submitted_date: getDateInMonth(15),
        reviewed_date: getDateInMonth(15),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        items: [
          { item_id: itemIds[0], ordered_qty: 110, received_whole: 100, received_broken: 10 },
          { item_id: itemIds[1], ordered_qty: 65, received_whole: 65, received_broken: 0 },
        ],
      },
    ];

    let poCount = 0, inboundCount = 0;

    for (const scenario of purchaseScenarios) {
      try {
        // Create purchase order
        const poResult = await sql`
          INSERT INTO stock_purchase_orders (
            po_number, supplier_id, order_date, expected_arrival_date, status, total_amount, created_by
          ) VALUES (
            ${scenario.po_number}, ${scenario.supplier_id}, ${scenario.order_date}, 
            ${scenario.expected_arrival_date}, ${scenario.status}, ${scenario.total_amount}, 'seed-script'
          )
          RETURNING id
        `;
        poCount++;

        const poId = poResult[0].id;
        const truckPlate = 'TRK-' + scenario.shipment_number.slice(-3);

        // Create inbound shipment
        const inboundResult = await sql`
          INSERT INTO stock_inbound_shipments (
            shipment_number, purchase_order_id, supplier_id, transporter_id, vehicle_id,
            truck_license_plate, driver_name, driver_phone,
            arrival_date, submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
            approval_status, approval_notes, approved_at, approved_by_user_id,
            status, total_whole_qty, total_broken_qty, created_by
          ) VALUES (
            ${scenario.shipment_number}, ${poId}, ${scenario.supplier_id},
            ${scenario.supplier_id === supplierIds[0] ? transporterIds[0] : 
              scenario.supplier_id === supplierIds[1] ? transporterIds[1] :
              scenario.supplier_id === supplierIds[2] ? transporterIds[2] : transporterIds[3]},
            ${vehicleIds[0]},
            ${truckPlate}, 'Driver Name', '9876543350',
            ${scenario.arrival_date}, ${scenario.submitted_date}, ${scenario.submitted_by},
            ${scenario.reviewed_date || null}, ${scenario.reviewed_by || null},
            ${scenario.approval_status}, ${scenario.approval_notes || null},
            ${scenario.approved_date || null}, ${scenario.approved_by || null},
            ${scenario.shipment_status}, 
            ${scenario.items.reduce((sum, item) => sum + item.received_whole, 0)},
            ${scenario.items.reduce((sum, item) => sum + item.received_broken, 0)},
            'seed-script'
          )
          RETURNING id
        `;
        inboundCount++;

        const inboundId = inboundResult[0].id;

        // Add inbound shipment items
        for (const item of scenario.items) {
          await sql`
            INSERT INTO stock_inbound_shipment_items (
              inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty, unit_cost
            ) VALUES (
              ${inboundId}, ${item.item_id}, ${item.ordered_qty}, ${item.received_whole}, ${item.received_broken}, 500
            )
          `;
        }
      } catch (err) {
        if (err.code === '23505') {
          // Duplicate key - data already exists
          poCount = -1;  // Mark that we skipped
          break;
        } else {
          throw err;
        }
      }
    }

    if (poCount === -1) {
      console.log(`⏭️  Skipping shipment seeding (data already exists)`);
      poCount = 0;
      inboundCount = 0;
    }
    } // close the else for inbound shipments

    console.log(`✅ Created ${poCount} purchase orders and ${inboundCount} inbound shipments`);

    // ===== SEED SALES ORDERS & OUTBOUND SHIPMENTS =====
    console.log('\n📤 Seeding sales orders and outbound shipments...');

    const existingOutboundShipments = await sql`SELECT COUNT(*) as count FROM stock_outbound_shipments`;
    if (existingOutboundShipments[0].count > 0) {
      console.log(`⏭️  Skipping outbound shipment seeding (${existingOutboundShipments[0].count} shipments already exist)`);
    } else {
    const salesScenarios = [
      // Delivered (3 days ago)
      {
        order_number: 'SO-2026-001',
        customer_id: customerIds[0],
        order_date: getDateInMonth(4),
        status: 'dispatched',
        total_amount: 25000,
        dispatch_status: 'dispatched',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-001',
        dispatch_date: getDateInMonth(6),
        submitted_date: getDateInMonth(6),
        reviewed_date: getDateInMonth(6),
        approved_date: addHours(getDateInMonth(6), 1),
        submitted_by: userIds[4],
        reviewed_by: userIds[2],
        approved_by: userIds[0],
        items: [
          { item_id: itemIds[0], ordered_qty: 50, loaded_whole: 50, loaded_broken: 0 },
        ],
      },
      // Approved, pending dispatch
      {
        order_number: 'SO-2026-002',
        customer_id: customerIds[1],
        order_date: getDateInMonth(8),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-002',
        dispatch_date: getDateInMonth(9),
        submitted_date: getDateInMonth(9),
        reviewed_date: getDateInMonth(9),
        approved_date: addHours(getDateInMonth(9), 2),
        submitted_by: userIds[5],
        reviewed_by: userIds[3],
        approved_by: userIds[1],
        items: [
          { item_id: itemIds[2], ordered_qty: 80, loaded_whole: 80, loaded_broken: 0 },
          { item_id: itemIds[4], ordered_qty: 60, loaded_whole: 60, loaded_broken: 0 },
        ],
      },
      // Pending approval
      {
        order_number: 'SO-2026-003',
        customer_id: customerIds[2],
        order_date: getDateInMonth(10),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'pending',
        shipment_number: 'OUTBOUND-003',
        dispatch_date: getDateInMonth(10),
        submitted_date: getDateInMonth(10),
        submitted_by: userIds[4],
        items: [
          { item_id: itemIds[1], ordered_qty: 40, loaded_whole: 40, loaded_broken: 0 },
          { item_id: itemIds[3], ordered_qty: 30, loaded_whole: 30, loaded_broken: 0 },
        ],
      },
      // Delivered (5 days ago)
      {
        order_number: 'SO-2026-004',
        customer_id: customerIds[3],
        order_date: getDateInMonth(2),
        status: 'dispatched',
        dispatch_status: 'dispatched',
        approval_status: 'approved',
        shipment_number: 'OUTBOUND-004',
        dispatch_date: getDateInMonth(5),
        submitted_date: getDateInMonth(5),
        reviewed_date: getDateInMonth(5),
        approved_date: addHours(getDateInMonth(5), 1),
        submitted_by: userIds[5],
        reviewed_by: userIds[2],
        approved_by: userIds[0],
        items: [
          { item_id: itemIds[5], ordered_qty: 35, loaded_whole: 35, loaded_broken: 0 },
        ],
      },
      // Changes requested
      {
        order_number: 'SO-2026-005',
        customer_id: customerIds[4],
        order_date: getDateInMonth(7),
        status: 'picked',
        dispatch_status: 'submitted',
        approval_status: 'changes_requested',
        shipment_number: 'OUTBOUND-005',
        dispatch_date: getDateInMonth(8),
        submitted_date: getDateInMonth(8),
        reviewed_date: getDateInMonth(8),
        submitted_by: userIds[4],
        reviewed_by: userIds[3],
        approval_notes: 'Please add insurance and confirm delivery date',
        items: [
          { item_id: itemIds[6], ordered_qty: 60, loaded_whole: 60, loaded_broken: 0 },
        ],
      },
    ];

    let soCount = 0, outboundCount = 0;

    for (const scenario of salesScenarios) {
      const soResult = await sql`
        INSERT INTO stock_sales_orders (
          order_number, customer_id, order_date, status, total_amount, created_by
        ) VALUES (
          ${scenario.order_number}, ${scenario.customer_id}, ${scenario.order_date},
          ${scenario.status}, ${scenario.total_amount}, 'seed-script'
        )
        RETURNING id
      `;
      soCount++;

      const soId = soResult[0].id;
      const truckPlate = 'TRK-' + scenario.shipment_number.slice(-3);

      const outboundResult = await sql`
        INSERT INTO stock_outbound_shipments (
          shipment_number, sales_order_id, vehicle_id, customer_name, customer_phone,
          truck_license_plate, driver_name, driver_phone,
          submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approval_notes, approved_at, approved_by_user_id,
          dispatch_date, status, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${soId}, ${vehicleIds[0]},
          'Customer Name', '9876543360', ${truckPlate},
          'Driver', '9876543361',
          ${scenario.submitted_date}, ${scenario.submitted_by},
          ${scenario.reviewed_date || null}, ${scenario.reviewed_by || null},
          ${scenario.approval_status}, ${scenario.approval_notes || null},
          ${scenario.approved_date || null}, ${scenario.approved_by || null},
          ${scenario.dispatch_date}, ${scenario.dispatch_status}, 'seed-script'
        )
        RETURNING id
      `;
      outboundCount++;

      const outboundId = outboundResult[0].id;

      for (const item of scenario.items) {
        await sql`
          INSERT INTO stock_outbound_shipment_items (
            outbound_shipment_id, item_id, loaded_whole_qty, loaded_broken_qty
          ) VALUES (
            ${outboundId}, ${item.item_id}, ${item.loaded_whole}, ${item.loaded_broken}
          )
        `;
      }
    }
    } // close the else for outbound shipments

    console.log(`✅ Created ${soCount} sales orders and ${outboundCount} outbound shipments`);

    // ===== SEED CHANGE REQUESTS =====
    console.log('\n🔄 Seeding change requests for manager/admin workflow...');

    // Check if change requests already exist
    const existingChangeRequests = await sql`SELECT COUNT(*) as count FROM stock_change_requests`;
    if (existingChangeRequests[0].count > 0) {
      console.log(`⏭️  Skipping change request seeding (${existingChangeRequests[0].count} requests already exist)`);
    } else {

    const changeRequests = [
      {
        request_number: 'CR-2026-001',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 2,
        request_type: 'correct',
        status: 'pending',
        reason: 'Quantity mismatch in received items - need to recount',
        priority: 'high',
        requested_by: userIds[4],
        requested_by_name: 'Stock Maintainer A',
      },
      {
        request_number: 'CR-2026-002',
        source_entity_type: 'outbound_shipment',
        source_entity_id: 3,
        request_type: 'update',
        status: 'approved',
        reason: 'Update delivery date and add insurance',
        priority: 'normal',
        requested_by: userIds[5],
        requested_by_name: 'Stock Maintainer B',
        reviewed_by: userIds[2],
        approved_by: userIds[0],
      },
      {
        request_number: 'CR-2026-003',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 5,
        request_type: 'approve',
        status: 'approved',
        reason: 'Verify and approve inbound shipment after manager review',
        priority: 'normal',
        requested_by: userIds[2],
        requested_by_name: 'Manager One',
        reviewed_by: userIds[0],
        approved_by: userIds[0],
      },
      {
        request_number: 'CR-2026-004',
        source_entity_type: 'stock_item',
        source_entity_id: 1,
        request_type: 'update',
        status: 'reviewed',
        reason: 'Need to update stock item price',
        priority: 'low',
        requested_by: userIds[4],
        requested_by_name: 'Stock Maintainer A',
        reviewed_by: userIds[3],
      },
      {
        request_number: 'CR-2026-005',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 1,
        request_type: 'correct',
        status: 'pending',
        reason: 'Need to record missing documentation for audit',
        priority: 'urgent',
        requested_by: userIds[5],
        requested_by_name: 'Stock Maintainer B',
      },
    ];

    let crCount = 0;
    for (const cr of changeRequests) {
      await sql`
        INSERT INTO stock_change_requests (
          request_number, source_entity_type, source_entity_id, request_type, status, 
          reason, priority, requested_by_user_id, requested_by_name, 
          reviewed_by_user_id, approved_by_user_id
        ) VALUES (
          ${cr.request_number}, ${cr.source_entity_type}, ${cr.source_entity_id},
          ${cr.request_type}, ${cr.status}, ${cr.reason}, ${cr.priority},
          ${cr.requested_by}, ${cr.requested_by_name},
          ${cr.reviewed_by || null}, ${cr.approved_by || null}
        )
      `;
      crCount++;
    }
    }

    console.log(`✅ Created ${crCount} change requests`);

    // ===== SEED TIMELINE EVENTS =====
    console.log('\n📊 Seeding timeline events for visualization...');

    // Only seed if not already done
    const existingEvents = await sql`SELECT COUNT(*) as count FROM stock_timeline_events`;
    if (existingEvents[0].count === 0) {

    const events = [
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-001 submitted', entity_id: 1, recorded_by: userIds[4] },
      { event_type: 'inbound_reviewed', summary: 'Inbound shipment INBOUND-001 reviewed', entity_id: 1, recorded_by: userIds[2] },
      { event_type: 'inbound_approved', summary: 'Inbound shipment INBOUND-001 approved', entity_id: 1, recorded_by: userIds[0] },
      { event_type: 'inbound_received', summary: 'Inbound shipment INBOUND-001 received and logged', entity_id: 1, recorded_by: userIds[4] },
      
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-002 submitted', entity_id: 2, recorded_by: userIds[5] },
      
      { event_type: 'inbound_submitted', summary: 'Inbound shipment INBOUND-003 submitted', entity_id: 3, recorded_by: userIds[4] },
      { event_type: 'change_requested', summary: 'Changes requested on INBOUND-003 - verify broken qty', entity_id: 3, recorded_by: userIds[3] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-001 submitted', entity_id: 1, recorded_by: userIds[4] },
      { event_type: 'outbound_reviewed', summary: 'Outbound shipment OUTBOUND-001 reviewed', entity_id: 1, recorded_by: userIds[2] },
      { event_type: 'outbound_approved', summary: 'Outbound shipment OUTBOUND-001 approved', entity_id: 1, recorded_by: userIds[0] },
      { event_type: 'outbound_dispatched', summary: 'Outbound shipment OUTBOUND-001 dispatched', entity_id: 1, recorded_by: userIds[4] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-002 submitted', entity_id: 2, recorded_by: userIds[5] },
      { event_type: 'outbound_approved', summary: 'Outbound shipment OUTBOUND-002 approved', entity_id: 2, recorded_by: userIds[1] },
      
      { event_type: 'outbound_submitted', summary: 'Outbound shipment OUTBOUND-003 submitted', entity_id: 3, recorded_by: userIds[4] },
      
      { event_type: 'user_created', summary: 'Stock maintainer user created', entity_id: userIds[4], recorded_by: userIds[0] },
    ];

    let eventCount = 0;
    for (const event of events) {
      await sql`
        INSERT INTO stock_timeline_events (
          event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary, occurred_at
        ) VALUES (
          'EVT-' || LPAD(${eventCount + 1}::TEXT, 4, '0'),
          ${event.event_type}, 'shipment', ${event.entity_id}, ${event.recorded_by},
          ${event.summary},
          NOW() - INTERVAL '${Math.random() * 10} days'
        )
      `;
      eventCount++;
    }
    } else {
      console.log(`⏭️  Skipping timeline event seeding (${existingEvents[0].count} events already exist)`);
    }

    console.log(`✅ Created ${eventCount} timeline events`);

    // ===== SEED NOTIFICATIONS =====
    console.log('\n📬 Seeding notifications...');

    // Only seed if not already done
    const existingNotifications = await sql`SELECT COUNT(*) as count FROM stock_notifications`;
    if (existingNotifications[0].count === 0) {

    const notifications = [
      {
        notification_number: 'NOTIF-001',
        channel: 'whatsapp',
        event_type: 'inbound_arrival',
        recipients: JSON.stringify([{ phone: '9876543400', name: 'Rajesh Kumar' }]),
        message_text: 'New inbound shipment INBOUND-001 arrived. Pending approval.',
        status: 'sent',
      },
      {
        notification_number: 'NOTIF-002',
        channel: 'whatsapp',
        event_type: 'outbound_dispatch',
        recipients: JSON.stringify([{ phone: '8765432100', name: 'John Contractor' }]),
        message_text: 'Your order OUTBOUND-001 has been dispatched. Estimated delivery in 2 days.',
        status: 'sent',
      },
      {
        notification_number: 'NOTIF-003',
        channel: 'email',
        event_type: 'low_stock',
        recipients: JSON.stringify([{ email: 'manager1@stock.com', name: 'Manager One' }]),
        message_text: 'Stock level for item KAJ-600-WHT is below reorder level (5 boxes remaining).',
        status: 'pending',
      },
    ];

    let notifCount = 0;
    for (const notif of notifications) {
      await sql`
        INSERT INTO stock_notifications (
          notification_number, channel, event_type, recipients, message_text, status
        ) VALUES (
          ${notif.notification_number}, ${notif.channel}, ${notif.event_type},
          ${notif.recipients}, ${notif.message_text}, ${notif.status}
        )
      `;
      notifCount++;
    }
    } else {
      console.log(`⏭️  Skipping notifications seeding (${existingNotifications[0].count} notifications already exist)`);
    }

    console.log(`✅ Created ${notifCount} notifications`);

    console.log('\n✨ Database seeding/verification completed! ✨\n');
    
    // Show actual database statistics
    console.log('📊 Actual Database Content Summary:');
    
    const tables = [
      'stock_brands', 'stock_types', 'stock_sizes', 'stock_locations',
      'stock_suppliers', 'stock_customers', 'stock_transporters', 'stock_vehicles',
      'stock_sales_people', 'stock_app_users', 'stock_items',
      'stock_purchase_orders', 'stock_inbound_shipments', 'stock_sales_orders',
      'stock_outbound_shipments', 'stock_change_requests', 'stock_timeline_events',
      'stock_notifications'
    ];
    
    for (const table of tables) {
      try {
        const result = await sql`SELECT COUNT(*) as count FROM ${sql(table)}`;
        console.log(`   • ${table}: ${result[0].count} records`);
      } catch (err) {
        console.log(`   • ${table}: [not accessible]`);
      }
    }

    console.log('\n🎯 Ready for monthly graph visualization and admin role validation!\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the seeding
seedStockDatabase();

```


---
### FILE: ./scripts/migrate-department-columns.mjs
```javascript
#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrateDepartmentColumns() {
  try {
    await sql`
      ALTER TABLE stock_app_users
      ADD COLUMN IF NOT EXISTS department TEXT
    `;

    await sql`
      ALTER TABLE stock_items
      ADD COLUMN IF NOT EXISTS department TEXT
    `;

    await sql`
      UPDATE stock_app_users
      SET department = 'General'
      WHERE role = 'salesperson'
        AND COALESCE(NULLIF(TRIM(department), ''), '') = ''
    `;

    await sql`
      UPDATE stock_items
      SET department = 'General'
      WHERE COALESCE(NULLIF(TRIM(department), ''), '') = ''
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_stock_app_users_role_department
      ON stock_app_users(role, department)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_stock_items_department
      ON stock_items(department)
    `;

    console.log('Department columns migration completed successfully.');
  } catch (error) {
    console.error('Failed to run department columns migration:', error.message);
    process.exit(1);
  }
}

migrateDepartmentColumns();

```


---
### FILE: ./scripts/fresh-seed.js
```javascript
#!/usr/bin/env node

/**
 * Stock Management Database Fresh Seed Script
 * 
 * This script TRUNCATES all existing data and seeds from scratch
 * with proper dependency ordering to avoid conflicts.
 * 
 * Run with: node scripts/fresh-seed.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Utility functions
function getDateInMonth(dayOffset) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = new Date(year, month, Math.min(dayOffset, 28));
  return date;
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

async function freshSeedDatabase() {
  console.log('🗑️  Starting fresh database seed...\n');

  try {
    // ===== DELETE ALL DATA IN REVERSE ORDER =====
    console.log('🧹 Cleaning up existing data...');
    
    // Delete in dependency order (leaf tables first)  
    try {
      console.log('  Deleting records from all tables...');
      await sql`DELETE FROM stock_notifications`;
      await sql`DELETE FROM stock_timeline_events`;
      await sql`DELETE FROM stock_audit_logs`;
      await sql`DELETE FROM stock_change_requests`;
      await sql`DELETE FROM stock_customer_acknowledgements`;
      await sql`DELETE FROM stock_cost_entries`;
      await sql`DELETE FROM stock_documents`;
      await sql`DELETE FROM stock_movements`;
      await sql`DELETE FROM stock_inventory_lots`;
      await sql`DELETE FROM stock_outbound_shipment_items`;
      await sql`DELETE FROM stock_outbound_shipments`;
      await sql`DELETE FROM stock_sales_order_items`;
      await sql`DELETE FROM stock_sales_orders`;
      await sql`DELETE FROM stock_inbound_shipment_items`;
      await sql`DELETE FROM stock_inbound_shipments`;
      await sql`DELETE FROM stock_purchase_order_items`;
      await sql`DELETE FROM stock_purchase_orders`;
      await sql`DELETE FROM stock_items`;
      await sql`DELETE FROM stock_app_users`;
      await sql`DELETE FROM stock_sales_people`;
      await sql`DELETE FROM stock_vehicles`;
      await sql`DELETE FROM stock_transporters`;
      await sql`DELETE FROM stock_customers`;
      await sql`DELETE FROM stock_suppliers`;
      await sql`DELETE FROM stock_locations`;
      await sql`DELETE FROM stock_sizes`;
      await sql`DELETE FROM stock_types`;
      await sql`DELETE FROM stock_brands`;
      console.log('  ✓ All records deleted');
    } catch (err) {
      if (err.code !== '42P01') {
        console.log(`  ⚠️  Some cleanup errors (tables may have dependencies): ${err.message}`);
      }
    }

    console.log('✅ Tables cleaned\n');

    // ===== FIX ROLE CONSTRAINT =====
    console.log('🔧 Setting up role constraint...');
    try {
      // First, drop the old constraint if it exists
      await sql`ALTER TABLE stock_app_users DROP CONSTRAINT IF EXISTS stock_app_users_role_check`;
      // Add the correct constraint
      await sql`ALTER TABLE stock_app_users ADD CONSTRAINT stock_app_users_role_check CHECK (role IN ('admin', 'manager', 'stock_maintainer'))`;
      console.log('  ✓ Role constraint fixed');
    } catch (err) {
      console.log(`  ⚠️  Role constraint setup: ${err.message}`);
    }
    console.log('✅ Constraints ready\n');

    // ===== SEED MASTER DATA (No dependencies) =====
    console.log('📋 Seeding master data...');

    const brands = [
      { name: 'Kajaria', name_hi: 'काजरिया', description: 'Premium Indian tile brand' },
      { name: 'Somany', name_hi: 'सोमनी', description: 'Leading tile manufacturer' },
      { name: 'Brillant', name_hi: 'ब्रिलिएंट', description: 'Quality marble tiles' },
      { name: 'Nitco', name_hi: 'नित्को', description: 'Premium vitrified tiles' },
      { name: 'Rak Ceramics', name_hi: 'राक सिरामिक्स', description: 'International quality' },
    ];

    const brandIds = [];
    for (const brand of brands) {
      const result = await sql`
        INSERT INTO stock_brands (name, name_hi, description)
        VALUES (${brand.name}, ${brand.name_hi}, ${brand.description})
        RETURNING id
      `;
      brandIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${brandIds.length} brands`);

    const types = [
      { name: 'Vitrified', name_hi: 'विट्रिफाइड' },
      { name: 'Marble', name_hi: 'मार्बल' },
      { name: 'Granite', name_hi: 'ग्रेनाइट' },
      { name: 'Ceramic', name_hi: 'सिरेमिक' },
      { name: 'Porcelain', name_hi: 'पोर्सिलेन' },
    ];

    const typeIds = [];
    for (const type of types) {
      const result = await sql`
        INSERT INTO stock_types (name, name_hi)
        VALUES (${type.name}, ${type.name_hi})
        RETURNING id
      `;
      typeIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${typeIds.length} types`);

    const sizes = [
      { label: '600x600', width_mm: 600, length_mm: 600, thickness_mm: 20 },
      { label: '800x800', width_mm: 800, length_mm: 800, thickness_mm: 20 },
      { label: '1200x600', width_mm: 1200, length_mm: 600, thickness_mm: 20 },
      { label: '300x600', width_mm: 300, length_mm: 600, thickness_mm: 10 },
    ];

    const sizeIds = [];
    for (const size of sizes) {
      const result = await sql`
        INSERT INTO stock_sizes (label, width_mm, length_mm, thickness_mm)
        VALUES (${size.label}, ${size.width_mm}, ${size.length_mm}, ${size.thickness_mm})
        RETURNING id
      `;
      sizeIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${sizeIds.length} sizes`);

    const locations = [
      { name: 'Main Warehouse', location_type: 'warehouse', address: 'Industrial Area' },
      { name: 'Showroom', location_type: 'showroom', address: 'Delhi' },
      { name: 'Yard', location_type: 'yard', address: 'Outside' },
      { name: 'In Transit', location_type: 'in_transit', address: 'Various' },
    ];

    const locationIds = [];
    for (const loc of locations) {
      const result = await sql`
        INSERT INTO stock_locations (name, location_type, address)
        VALUES (${loc.name}, ${loc.location_type}, ${loc.address})
        RETURNING id
      `;
      locationIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${locationIds.length} locations`);

    const suppliers = [
      { name: 'Kajaria Delhi', gst_number: '07AABCU1234F1Z0', phone: '9876543220', email: 'kajaria@supplier.com', address: 'Noida' },
      { name: 'Somany Mumbai', gst_number: '27AABCS1234F1Z0', phone: '9876543221', email: 'somany@supplier.com', address: 'Mumbai' },
      { name: 'Brillant Tiles', gst_number: '07AABCTS1234F1Z0', phone: '9876543222', email: 'brillant@supplier.com', address: 'Delhi' },
      { name: 'Premium Imports', gst_number: '07AABCU2234F1Z0', phone: '9876543223', email: 'premium@supplier.com', address: 'Bangalore' },
    ];

    const supplierIds = [];
    for (const supplier of suppliers) {
      const result = await sql`
        INSERT INTO stock_suppliers (name, gst_number, phone, email, address)
        VALUES (${supplier.name}, ${supplier.gst_number}, ${supplier.phone}, ${supplier.email}, ${supplier.address})
        RETURNING id
      `;
      supplierIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${supplierIds.length} suppliers`);

    const customers = [
      { name: 'John Contractor', phone: '8765432100', whatsapp_phone: '8765432100', email: 'john@contractor.com', company_name: 'John Constructions' },
      { name: 'Priya Interiors', phone: '8765432101', whatsapp_phone: '8765432101', email: 'priya@interiors.com', company_name: 'Priya Interiors' },
      { name: 'Builder Hub', phone: '8765432102', whatsapp_phone: '8765432102', email: 'builders@hub.com', company_name: 'Builder Hub' },
      { name: 'Retail A', phone: '8765432103', whatsapp_phone: '8765432103', email: 'retail@outlet.com', company_name: 'Retail Outlet' },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const result = await sql`
        INSERT INTO stock_customers (name, phone, whatsapp_phone, email, company_name)
        VALUES (${customer.name}, ${customer.phone}, ${customer.whatsapp_phone}, ${customer.email}, ${customer.company_name})
        RETURNING id
      `;
      customerIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${customerIds.length} customers`);

    const transporters = [
      { name: 'Fast Logistics', contact_name: 'Ravi', phone: '7654321000', gst_number: '07AABCT1234F1Z0', address: 'Delhi' },
      { name: 'Express Haulers', contact_name: 'Vikram', phone: '7654321001', gst_number: '07AABCT2234F1Z0', address: 'Noida' },
      { name: 'Premium Transport', contact_name: 'Amit', phone: '7654321002', gst_number: '07AABCT3234F1Z0', address: 'Gurgaon' },
    ];

    const transporterIds = [];
    for (const transporter of transporters) {
      const result = await sql`
        INSERT INTO stock_transporters (name, contact_name, phone, gst_number, address)
        VALUES (${transporter.name}, ${transporter.contact_name}, ${transporter.phone}, ${transporter.gst_number}, ${transporter.address})
        RETURNING id
      `;
      transporterIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${transporterIds.length} transporters`);

    const vehicles = [
      { vehicle_number: 'DL01AB1234', vehicle_type: 'Truck', driver_name: 'Harish', driver_phone: '9876543300', transporter_id: transporterIds[0] },
      { vehicle_number: 'UP14MN5678', vehicle_type: 'Truck', driver_name: 'Sanjay', driver_phone: '9876543301', transporter_id: transporterIds[1] },
      { vehicle_number: 'HR26PH9012', vehicle_type: 'Truck', driver_name: 'Mohit', driver_phone: '9876543302', transporter_id: transporterIds[2] },
    ];

    const vehicleIds = [];
    for (const vehicle of vehicles) {
      const result = await sql`
        INSERT INTO stock_vehicles (vehicle_number, vehicle_type, driver_name, driver_phone, transporter_id)
        VALUES (${vehicle.vehicle_number}, ${vehicle.vehicle_type}, ${vehicle.driver_name}, ${vehicle.driver_phone}, ${vehicle.transporter_id})
        RETURNING id
      `;
      vehicleIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${vehicleIds.length} vehicles`);

    const salesPeople = [
      { name: 'Rajesh Kumar', phone: '9876543400', email: 'rajesh@sales.com', whatsapp_phone: '9876543400' },
      { name: 'Deepika Singh', phone: '9876543401', email: 'deepika@sales.com', whatsapp_phone: '9876543401' },
      { name: 'Arjun Patel', phone: '9876543402', email: 'arjun@sales.com', whatsapp_phone: '9876543402' },
    ];

    const salesPeopleIds = [];
    for (const person of salesPeople) {
      const result = await sql`
        INSERT INTO stock_sales_people (name, phone, email, whatsapp_phone)
        VALUES (${person.name}, ${person.phone}, ${person.email}, ${person.whatsapp_phone})
        RETURNING id
      `;
      salesPeopleIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${salesPeopleIds.length} sales people`);

    console.log('✅ Master data seeded\n');

    // ===== SEED USERS =====
    console.log('👥 Seeding users...');

    const users = [
      { name: 'Admin User', phone: '9111111111', email: 'admin@stock.com', role: 'admin', status: 'active' },
      { name: 'Manager One', phone: '9222222221', email: 'manager1@stock.com', role: 'manager', status: 'active' },
      { name: 'Manager Two', phone: '9222222222', email: 'manager2@stock.com', role: 'manager', status: 'active' },
      { name: 'Stock Maintainer A', phone: '9333333331', email: 'maintainer1@stock.com', role: 'stock_maintainer', status: 'active' },
      { name: 'Stock Maintainer B', phone: '9333333332', email: 'maintainer2@stock.com', role: 'stock_maintainer', status: 'active' },
    ];

    const userIds = [];
    for (const user of users) {
      const result = await sql`
        INSERT INTO stock_app_users (name, phone, email, role, status)
        VALUES (${user.name}, ${user.phone}, ${user.email}, ${user.role}, ${user.status})
        RETURNING id
      `;
      userIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${userIds.length} users`);
    console.log('✅ Users seeded\n');

    // ===== SEED STOCK ITEMS =====
    console.log('📦 Seeding stock items...');

    const items = [
      { sku: 'KAJ-600-WHT-001', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[0], name: 'Kajaria White 600x600', tiles_per_box: 4, purchase_price: 450, selling_price: 599 },
      { sku: 'KAJ-800-BLK-001', brand_id: brandIds[0], type_id: typeIds[0], size_id: sizeIds[1], name: 'Kajaria Black 800x800', tiles_per_box: 2, purchase_price: 850, selling_price: 1199 },
      { sku: 'SOM-600-GRY-001', brand_id: brandIds[1], type_id: typeIds[0], size_id: sizeIds[0], name: 'Somany Grey 600x600', tiles_per_box: 4, purchase_price: 400, selling_price: 549 },
      { sku: 'BRL-MBL-CRM-001', brand_id: brandIds[2], type_id: typeIds[1], size_id: sizeIds[2], name: 'Brillant Marble Cream', tiles_per_box: 2, purchase_price: 1200, selling_price: 1799 },
      { sku: 'NIT-GRN-300-001', brand_id: brandIds[3], type_id: typeIds[0], size_id: sizeIds[3], name: 'Nitco Green 300x600', tiles_per_box: 8, purchase_price: 180, selling_price: 299 },
      { sku: 'RAK-GOLD-001', brand_id: brandIds[4], type_id: typeIds[2], size_id: sizeIds[0], name: 'Rak Granite Gold', tiles_per_box: 4, purchase_price: 650, selling_price: 899 },
    ];

    const itemIds = [];
    for (const item of items) {
      const result = await sql`
        INSERT INTO stock_items (
          sku, brand_id, type_id, size_id, name, tiles_per_box,
          purchase_price, selling_price, reorder_level
        ) VALUES (
          ${item.sku}, ${item.brand_id}, ${item.type_id}, ${item.size_id}, ${item.name},
          ${item.tiles_per_box}, ${item.purchase_price}, ${item.selling_price}, 20
        )
        RETURNING id
      `;
      itemIds.push(result[0].id);
    }
    console.log(`  ✓ Created ${itemIds.length} stock items`);
    console.log('✅ Stock items seeded\n');

    // ===== SEED PURCHASE ORDERS & INBOUND SHIPMENTS =====
    console.log('📥 Seeding inbound shipments...');

    const inboundScenarios = [
      {
        po_number: 'PO-2026-001',
        supplier_id: supplierIds[0],
        status: 'received',
        total_amount: 45000,
        shipment_number: 'INBOUND-2026-001',
        approval_status: 'approved',
        arrival_days_ago: 5,
        items: [{ item_id: itemIds[0], ordered_qty: 100, received_whole: 95, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-002',
        supplier_id: supplierIds[1],
        status: 'received',
        total_amount: 38500,
        shipment_number: 'INBOUND-2026-002',
        approval_status: 'approved',
        arrival_days_ago: 3,
        items: [{ item_id: itemIds[1], ordered_qty: 50, received_whole: 50, received_broken: 0 }],
      },
      {
        po_number: 'PO-2026-003',
        supplier_id: supplierIds[2],
        status: 'received',
        total_amount: 52300,
        shipment_number: 'INBOUND-2026-003',
        approval_status: 'pending',
        arrival_days_ago: 1,
        items: [{ item_id: itemIds[2], ordered_qty: 80, received_whole: 75, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-004',
        supplier_id: supplierIds[0],
        status: 'received',
        total_amount: 35000,
        shipment_number: 'INBOUND-2026-004',
        approval_status: 'changes_requested',
        arrival_days_ago: 2,
        items: [{ item_id: itemIds[3], ordered_qty: 40, received_whole: 35, received_broken: 5 }],
      },
      {
        po_number: 'PO-2026-005',
        supplier_id: supplierIds[1],
        status: 'received',
        total_amount: 42000,
        shipment_number: 'INBOUND-2026-005',
        approval_status: 'approved',
        arrival_days_ago: 1,
        items: [{ item_id: itemIds[4], ordered_qty: 120, received_whole: 120, received_broken: 0 }],
      },
      {
        po_number: 'PO-2026-006',
        supplier_id: supplierIds[3],
        status: 'received',
        total_amount: 38000,
        shipment_number: 'INBOUND-2026-006',
        approval_status: 'reviewed',
        arrival_days_ago: 0, // today
        items: [{ item_id: itemIds[5], ordered_qty: 60, received_whole: 58, received_broken: 2 }],
      },
    ];

    let inboundCount = 0;

    for (const scenario of inboundScenarios) {
      // Create PO
      const poResult = await sql`
        INSERT INTO stock_purchase_orders (
          po_number, supplier_id, status, total_amount, created_by
        ) VALUES (
          ${scenario.po_number}, ${scenario.supplier_id}, ${scenario.status},
          ${scenario.total_amount}, 'fresh-seed'
        )
        RETURNING id
      `;
      const poId = poResult[0].id;

      // Calculate dates
      const arrivalDate = getDateInMonth(28 - scenario.arrival_days_ago);
      const submittedDate = arrivalDate;
      const reviewedDate = scenario.approval_status !== 'pending' ? addHours(submittedDate, 2) : null;
      const approvedDate = scenario.approval_status === 'approved' ? addHours(reviewedDate || submittedDate, 1) : null;

      // Create inbound shipment
      const inboundResult = await sql`
        INSERT INTO stock_inbound_shipments (
          shipment_number, purchase_order_id, supplier_id, transporter_id, vehicle_id,
          truck_license_plate, driver_name, driver_phone,
          arrival_date, submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approved_at, approved_by_user_id,
          status, total_whole_qty, total_broken_qty, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${poId}, ${scenario.supplier_id},
          ${transporterIds[0]}, ${vehicleIds[0]},
          'TRK-001', 'Driver Name', '9876543350',
          ${arrivalDate}, ${submittedDate}, ${userIds[3]},
          ${reviewedDate}, ${userIds[1]},
          ${scenario.approval_status}, ${approvedDate}, ${userIds[0]},
          'received',
          ${scenario.items.reduce((sum, i) => sum + i.received_whole, 0)},
          ${scenario.items.reduce((sum, i) => sum + i.received_broken, 0)},
          'fresh-seed'
        )
        RETURNING id
      `;
      const inboundId = inboundResult[0].id;
      inboundCount++;

      // Create inbound items
      for (const item of scenario.items) {
        await sql`
          INSERT INTO stock_inbound_shipment_items (
            inbound_shipment_id, item_id, ordered_qty, received_whole_qty, received_broken_qty, unit_cost
          ) VALUES (
            ${inboundId}, ${item.item_id}, ${item.ordered_qty},
            ${item.received_whole}, ${item.received_broken}, 500
          )
        `;
      }
    }

    console.log(`  ✓ Created ${inboundCount} inbound shipments`);
    console.log('✅ Inbound shipments seeded\n');

    // ===== SEED OUTBOUND SHIPMENTS =====
    console.log('📤 Seeding outbound shipments...');

    const outboundScenarios = [
      {
        order_number: 'SO-2026-001',
        customer_id: customerIds[0],
        status: 'dispatched',
        total_amount: 25000,
        shipment_number: 'OUTBOUND-2026-001',
        approval_status: 'approved',
        dispatch_days_ago: 4,
        items: [{ item_id: itemIds[0], loaded_whole: 50, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-002',
        customer_id: customerIds[1],
        status: 'dispatched',
        total_amount: 30000,
        shipment_number: 'OUTBOUND-2026-002',
        approval_status: 'approved',
        dispatch_days_ago: 2,
        items: [{ item_id: itemIds[1], loaded_whole: 40, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-003',
        customer_id: customerIds[2],
        status: 'picked',
        total_amount: 28000,
        shipment_number: 'OUTBOUND-2026-003',
        approval_status: 'pending',
        dispatch_days_ago: 0, // today
        items: [{ item_id: itemIds[2], loaded_whole: 80, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-004',
        customer_id: customerIds[3],
        status: 'picked',
        total_amount: 22000,
        shipment_number: 'OUTBOUND-2026-004',
        approval_status: 'changes_requested',
        dispatch_days_ago: 0,
        items: [{ item_id: itemIds[3], loaded_whole: 35, loaded_broken: 0 }],
      },
      {
        order_number: 'SO-2026-005',
        customer_id: customerIds[0],
        status: 'dispatched',
        total_amount: 32000,
        shipment_number: 'OUTBOUND-2026-005',
        approval_status: 'approved',
        dispatch_days_ago: 1,
        items: [{ item_id: itemIds[4], loaded_whole: 100, loaded_broken: 0 }],
      },
    ];

    let outboundCount = 0;

    for (const scenario of outboundScenarios) {
      // Create SO
      const soResult = await sql`
        INSERT INTO stock_sales_orders (
          order_number, customer_id, status, total_amount, created_by
        ) VALUES (
          ${scenario.order_number}, ${scenario.customer_id}, ${scenario.status},
          ${scenario.total_amount}, 'fresh-seed'
        )
        RETURNING id
      `;
      const soId = soResult[0].id;

      // Calculate dates
      const dispatchDate = getDateInMonth(28 - scenario.dispatch_days_ago);
      const submittedDate = dispatchDate;
      const reviewedDate = scenario.approval_status !== 'pending' ? addHours(submittedDate, 1) : null;
      const approvedDate = scenario.approval_status === 'approved' ? addHours(reviewedDate || submittedDate, 1) : null;

      // Create outbound shipment
      const outboundResult = await sql`
        INSERT INTO stock_outbound_shipments (
          shipment_number, sales_order_id, vehicle_id, customer_name, customer_phone,
          truck_license_plate, driver_name, driver_phone,
          submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id,
          approval_status, approved_at, approved_by_user_id,
          dispatch_date, status, created_by
        ) VALUES (
          ${scenario.shipment_number}, ${soId}, ${vehicleIds[0]},
          'Customer', '9876543360', 'TRK-002', 'Driver', '9876543361',
          ${submittedDate}, ${userIds[3]},
          ${reviewedDate}, ${userIds[1]},
          ${scenario.approval_status}, ${approvedDate}, ${userIds[0]},
          ${dispatchDate}, 'dispatched', 'fresh-seed'
        )
        RETURNING id
      `;
      const outboundId = outboundResult[0].id;
      outboundCount++;

      // Create outbound items
      for (const item of scenario.items) {
        await sql`
          INSERT INTO stock_outbound_shipment_items (
            outbound_shipment_id, item_id, loaded_whole_qty, loaded_broken_qty
          ) VALUES (
            ${outboundId}, ${item.item_id}, ${item.loaded_whole}, ${item.loaded_broken}
          )
        `;
      }
    }

    console.log(`  ✓ Created ${outboundCount} outbound shipments`);
    console.log('✅ Outbound shipments seeded\n');

    // ===== SEED CHANGE REQUESTS =====
    console.log('🔄 Seeding change requests...');

    const changeRequests = [
      {
        request_number: 'CR-001',
        source_entity_type: 'inbound_shipment',
        source_entity_id: 4,
        request_type: 'correct',
        status: 'pending',
        reason: 'Verify broken qty count',
        priority: 'high',
        requested_by: userIds[3],
        requested_by_name: 'Stock Maintainer A',
      },
      {
        request_number: 'CR-002',
        source_entity_type: 'outbound_shipment',
        source_entity_id: 4,
        request_type: 'update',
        status: 'approved',
        reason: 'Add delivery confirmation',
        priority: 'normal',
        requested_by: userIds[3],
        requested_by_name: 'Stock Maintainer A',
        reviewed_by: userIds[1],
        approved_by: userIds[0],
      },
    ];

    let crCount = 0;
    for (const cr of changeRequests) {
      await sql`
        INSERT INTO stock_change_requests (
          request_number, source_entity_type, source_entity_id, request_type, status,
          reason, priority, requested_by_user_id, requested_by_name,
          reviewed_by_user_id, approved_by_user_id
        ) VALUES (
          ${cr.request_number}, ${cr.source_entity_type}, ${cr.source_entity_id},
          ${cr.request_type}, ${cr.status}, ${cr.reason}, ${cr.priority},
          ${cr.requested_by}, ${cr.requested_by_name},
          ${cr.reviewed_by || null}, ${cr.approved_by || null}
        )
      `;
      crCount++;
    }

    console.log(`  ✓ Created ${crCount} change requests`);
    console.log('✅ Change requests seeded\n');

    // ===== SEED TIMELINE EVENTS =====
    console.log('📊 Seeding timeline events...');

    const events = [
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-001 submitted', entity_id: 1, by: userIds[3] },
      { type: 'inbound_reviewed', summary: 'Inbound INBOUND-2026-001 reviewed', entity_id: 1, by: userIds[1] },
      { type: 'inbound_approved', summary: 'Inbound INBOUND-2026-001 approved', entity_id: 1, by: userIds[0] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-002 submitted', entity_id: 2, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-003 submitted', entity_id: 3, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-004 submitted', entity_id: 4, by: userIds[3] },
      { type: 'change_requested', summary: 'Changes requested CR-001', entity_id: 4, by: userIds[1] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-005 submitted', entity_id: 5, by: userIds[3] },
      { type: 'inbound_submitted', summary: 'Inbound INBOUND-2026-006 submitted', entity_id: 6, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-001 submitted', entity_id: 1, by: userIds[3] },
      { type: 'outbound_approved', summary: 'Outbound OUTBOUND-2026-001 approved', entity_id: 1, by: userIds[0] },
      { type: 'outbound_dispatched', summary: 'Outbound OUTBOUND-2026-001 dispatched', entity_id: 1, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-002 submitted', entity_id: 2, by: userIds[3] },
      { type: 'outbound_submitted', summary: 'Outbound OUTBOUND-2026-003 submitted', entity_id: 3, by: userIds[3] },
    ];

    let eventCount = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      await sql`
        INSERT INTO stock_timeline_events (
          event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary
        ) VALUES (
          ${'EVT-' + String(i + 1).padStart(4, '0')},
          ${event.type}, 'shipment', ${event.entity_id}, ${event.by}, ${event.summary}
        )
      `;
      eventCount++;
    }

    console.log(`  ✓ Created ${eventCount} timeline events`);
    console.log('✅ Timeline events seeded\n');

    // ===== FINAL SUMMARY =====
    console.log('✨ Fresh seeding completed successfully! ✨\n');

    // Get counts from database
    const brandCount = await sql`SELECT COUNT(*) as count FROM stock_brands`;
    const userCount = await sql`SELECT COUNT(*) as count FROM stock_app_users`;
    const itemCount = await sql`SELECT COUNT(*) as count FROM stock_items`;
    const inboudCount = await sql`SELECT COUNT(*) as count FROM stock_inbound_shipments`;
    const outboundCount2 = await sql`SELECT COUNT(*) as count FROM stock_outbound_shipments`;

    console.log('📊 Database Content Summary:');
    console.log(`   • Brands: ${brandCount[0].count}`);
    console.log(`   • Users: ${userCount[0].count} (1 admin, 2 manager, 2 maintainer)`);
    console.log(`   • Stock Items: ${itemCount[0].count}`);
    console.log(`   • Inbound Shipments: ${inboudCount[0].count}`);
    console.log(`      - Approved: 3`);
    console.log(`      - Pending: 1`);
    console.log(`      - Changes Required: 1`);
    console.log(`      - Reviewed: 1`);
    console.log(`   • Outbound Shipments: ${outboundCount2[0].count}`);
    console.log(`      - Approved: 3`);
    console.log(`      - Pending: 1`);
    console.log(`      - Changes Required: 1`);
    console.log(`   • Change Requests: ${crCount}`);
    console.log(`   • Timeline Events: ${eventCount}\n`);

    console.log('🎯 Ready for testing!');
    console.log('   Start dev server: npm run dev');
    console.log('   Test credentials: admin@stock.com (full access)');
    console.log('   Dashboard: http://localhost:3000/stock/approvals\n');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

freshSeedDatabase();

```


---
### FILE: ./scripts/setup-db.js
```javascript
#!/usr/bin/env node

/**
 * Database Setup Script for Neon
 * 
 * This script:
 * 1. Creates the products table
 * 2. Imports existing products from data/products.json
 * 
 * Run with: node scripts/setup-db.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('\nAdd it to your .env.local file:');
  console.log('DATABASE_URL=your_neon_connection_string\n');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // Create table
    console.log('📋 Creating products table...');
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        name_hi TEXT NOT NULL,
        category TEXT NOT NULL,
        category_hi TEXT NOT NULL,
        description TEXT NOT NULL,
        description_hi TEXT NOT NULL,
        price INTEGER NOT NULL,
        rating DECIMAL(2,1) DEFAULT 5.0,
        reviews INTEGER DEFAULT 0,
        in_stock BOOLEAN DEFAULT true,
        features JSONB NOT NULL DEFAULT '[]',
        features_hi JSONB NOT NULL DEFAULT '[]',
        specifications JSONB NOT NULL DEFAULT '{}',
        variants JSONB NOT NULL DEFAULT '[]',
        main_image TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ Table created\n');

    // Create indexes
    console.log('📇 Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`;
    console.log('✅ Indexes created\n');

    // Import products
    console.log('📦 Importing products from data/products.json...');
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

    for (const product of productsData) {
      await sql`
        INSERT INTO products (
          id, slug, name, name_hi, category, category_hi,
          description, description_hi, price, rating, reviews,
          in_stock, features, features_hi, specifications,
          variants, main_image
        ) VALUES (
          ${product.id},
          ${product.slug},
          ${product.name},
          ${product.nameHi},
          ${product.category},
          ${product.categoryHi},
          ${product.description},
          ${product.descriptionHi},
          ${product.price},
          ${product.rating},
          ${product.reviews},
          ${product.inStock},
          ${JSON.stringify(product.features)}::jsonb,
          ${JSON.stringify(product.featuresHi)}::jsonb,
          ${JSON.stringify(product.specifications)}::jsonb,
          ${JSON.stringify(product.variants)}::jsonb,
          ${product.mainImage}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          updated_at = NOW()
      `;
      console.log(`  ✓ Imported: ${product.name}`);
    }

    console.log(`\n✅ Successfully imported ${productsData.length} products`);
    console.log('\n🎉 Database setup complete!');
    console.log('\nYou can now:');
    console.log('  • Visit /admin to manage products');
    console.log('  • Products will be fetched from Neon database');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();

```


---
### FILE: ./lib/translations.js
```javascript
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

const translations = { en, hi };

export function getTranslation(key, language = 'en') {
  const keys = key.split('.');
  let value = translations[language];

  for (const k of keys) {
    if (!value || !value[k]) {
      console.warn(`Translation missing for key: ${key} in language: ${language}`);
      return key;
    }
    value = value[k];
  }

  return value;
}

```


---
### FILE: ./lib/products.js
```javascript
// Product data with variants based on actual product images
// In production, this is updated via the admin panel through data/products.json

import productsData from "@/data/products.json";

export const products = productsData;

export function getProductBySlug(slug) {
  return products.find(p => p.slug === slug);
}

export function getProductById(id) {
  return products.find(p => p.id === id);
}

export function getAllProducts() {
  return products;
}

export function getProductsByCategory(category) {
  return products.filter(p => p.category.toLowerCase() === category.toLowerCase());
}

```


---
### FILE: ./lib/db.js
```javascript
let sql = null;

// Try to import Neon if available
try {
  const { neon } = require('@neondatabase/serverless');
  const client = neon(process.env.DATABASE_URL);

  // Backward-compatible wrapper: supports sql('SELECT ...', [params])
  // which is used throughout the stock APIs.
  sql = async (query, params = []) => {
    if (typeof query !== 'string') {
      throw new Error('Query must be a string when calling sql(query, params)');
    }

    return client.query(query, params);
  };

  sql.query = (query, params = []) => client.query(query, params);
} catch (e) {
  // Neon not installed yet - provide a stub that gives helpful error
  console.warn('Neon database not configured yet. Set up Neon integration in Netlify.');
  sql = async (query, params) => {
    throw new Error('Database not configured. Enable Neon in Netlify dashboard. See STOCK_DEPLOYMENT_GUIDE.md Step 2');
  };
}

export { sql };

// Helper to convert DB row to product format
export function dbRowToProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameHi: row.name_hi,
    category: row.category,
    categoryHi: row.category_hi,
    description: row.description,
    descriptionHi: row.description_hi,
    price: row.price,
    rating: parseFloat(row.rating),
    reviews: row.reviews,
    inStock: row.in_stock,
    features: row.features,
    featuresHi: row.features_hi,
    specifications: row.specifications,
    variants: row.variants,
    mainImage: row.main_image,
  };
}

// Helper to convert product format to DB columns
export function productToDbRow(product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    name_hi: product.nameHi,
    category: product.category,
    category_hi: product.categoryHi,
    description: product.description,
    description_hi: product.descriptionHi,
    price: product.price,
    rating: product.rating,
    reviews: product.reviews,
    in_stock: product.inStock,
    features: JSON.stringify(product.features),
    features_hi: JSON.stringify(product.featuresHi),
    specifications: JSON.stringify(product.specifications),
    variants: JSON.stringify(product.variants),
    main_image: product.mainImage,
  };
}

```


---
### FILE: ./lib/auth0-management.js
```javascript
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_DATABASE_CONNECTION = process.env.AUTH0_DATABASE_CONNECTION || 'Username-Password-Authentication';
const MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_TYPES = 3;

function assertAuth0Config() {
  if (!AUTH0_DOMAIN) {
    throw new Error('AUTH0_DOMAIN is required');
  }

  if (!AUTH0_CLIENT_ID) {
    throw new Error('AUTH0_CLIENT_ID is required');
  }
}

function toReadableErrorMessage(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toReadableErrorMessage(entry)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message;
    }

    if (typeof value.description === 'string' && value.description.trim()) {
      return value.description;
    }

    if (typeof value.error_description === 'string' && value.error_description.trim()) {
      return value.error_description;
    }

    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${toReadableErrorMessage(entry)}`)
      .filter((entry) => !entry.endsWith(': '))
      .join('; ');
  }

  return String(value);
}

function getPasswordTypeCount(password) {
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  return [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length;
}

export function validateStockPassword(password) {
  const cleanPassword = String(password || '');

  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (getPasswordTypeCount(cleanPassword) < MIN_PASSWORD_TYPES) {
    return `Password must contain at least ${MIN_PASSWORD_TYPES} of these character types: lowercase, uppercase, number, and symbol.`;
  }

  return '';
}

async function auth0SignupRequest(payload) {
  assertAuth0Config();

  const response = await fetch(`https://${AUTH0_DOMAIN}/dbconnections/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = toReadableErrorMessage(json?.description || json?.error || json?.message || json?.error_description || text) || 'Auth0 signup failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return json;
}

export async function upsertAuth0DatabaseUser({ email, password, name, phone, connection = AUTH0_DATABASE_CONNECTION }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();

  if (!cleanEmail) {
    throw new Error('Email is required for Auth0 user creation');
  }

  const passwordError = validateStockPassword(cleanPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const payload = {
    client_id: AUTH0_CLIENT_ID,
    email: cleanEmail,
    password: cleanPassword,
    connection,
    verify_email: false,
    email_verified: false,
    name: cleanName || cleanEmail,
    user_metadata: {
      phone: cleanPhone || '',
      stock_user: 'true',
    },
  };

  return auth0SignupRequest(payload);
}

```


---
### FILE: ./lib/pagination.js
```javascript
export const DEFAULT_PAGE_SIZE = 10;

export function getPageCount(totalItems, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateRows(rows = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const pageCount = getPageCount(rows.length, pageSize);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const startIndex = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageCount,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, rows.length),
    rows: rows.slice(startIndex, startIndex + pageSize),
    total: rows.length,
  };
}

```


---
### FILE: ./lib/admin-config.js
```javascript
// Admin email addresses that have access to the admin panel
// Add your email(s) here
export const ADMIN_EMAILS = [
  'ssshivam.singh.2@gmail.com',
  // Add more admin emails as needed
];

export function isAdmin(userEmail) {
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}

```


---
### FILE: ./lib/auth0.js
```javascript
import { Auth0Client } from '@auth0/nextjs-auth0/server';

const appBaseUrl =
	process.env.APP_BASE_URL ||
	process.env.AUTH0_BASE_URL ||
	process.env.NEXT_PUBLIC_URL;

export const auth0 = new Auth0Client({
	appBaseUrl,
});
```


---
### FILE: ./lib/hooks/useAnimateOnScroll.js
```javascript
"use client"

import { useInView } from "react-intersection-observer";
import { cn } from "@/lib/utils";

export function useAnimateOnScroll(options) {
  const { ref, inView } = useInView(options);

  const getAnimationClasses = (baseClasses, animationClasses, delay) => {
    return {
      ref,
      className: cn(baseClasses, "animate-on-scroll", inView && animationClasses),
      style: { transitionDelay: inView ? delay : "0ms" },
    };
  };

  return { ref, inView, getAnimationClasses };
}

```


---
### FILE: ./lib/hooks/useInView.js
```javascript
import { useState, useEffect, useRef } from 'react';

export function useInView(options = {}) {
  const [isInView, setIsInView] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        // Once element has been animated, remove observer
        observer.unobserve(element);
      }
    }, {
      threshold: options.threshold || 0.1,
      rootMargin: options.rootMargin || '0px',
      ...options
    });

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [options.threshold, options.rootMargin]);

  return [elementRef, isInView];
}

```


---
### FILE: ./lib/db/orders.js
```javascript
// Mock database for orders - Replace with real database in production
// In production, use MongoDB with Mongoose or PostgreSQL with Prisma

let orders = [];
let orderIdCounter = 1000;

export const ordersDB = {
  // Create a new order
  create: async (orderData) => {
    const order = {
      id: `ORD-${orderIdCounter++}`,
      ...orderData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.push(order);
    return order;
  },

  // Get order by ID
  getById: async (orderId) => {
    return orders.find(order => order.id === orderId);
  },

  // Get all orders for a user
  getByUserId: async (userId) => {
    return orders
      .filter(order => order.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Get all orders for a user by email
  getByUserEmail: async (email) => {
    return orders
      .filter(order => order.userEmail === email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Update order status
  updateStatus: async (orderId, status) => {
    const orderIndex = orders.findIndex(order => order.id === orderId);
    if (orderIndex === -1) return null;
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      status,
      updatedAt: new Date().toISOString(),
    };
    return orders[orderIndex];
  },

  // Update order
  update: async (orderId, updates) => {
    const orderIndex = orders.findIndex(order => order.id === orderId);
    if (orderIndex === -1) return null;
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return orders[orderIndex];
  },

  // Get all orders (admin)
  getAll: async (filters = {}) => {
    let filteredOrders = [...orders];
    
    if (filters.status) {
      filteredOrders = filteredOrders.filter(order => order.status === filters.status);
    }
    
    if (filters.startDate) {
      filteredOrders = filteredOrders.filter(
        order => new Date(order.createdAt) >= new Date(filters.startDate)
      );
    }
    
    if (filters.endDate) {
      filteredOrders = filteredOrders.filter(
        order => new Date(order.createdAt) <= new Date(filters.endDate)
      );
    }
    
    return filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Delete order (admin)
  delete: async (orderId) => {
    const initialLength = orders.length;
    orders = orders.filter(order => order.id !== orderId);
    return initialLength > orders.length;
  },
};

```


---
### FILE: ./lib/utils.js
```javascript
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

```


---
### FILE: ./lib/audit-logger.js
```javascript
let sql = null;

// Try to import SQL client
try {
  const dbModule = require('@/lib/db');
  sql = dbModule.sql;
} catch (e) {
  console.warn('Audit logger: database not available');
}

/**
 * Audit Logger for stock system
 * Logs all user actions for compliance and debugging
 */

export async function logAudit({
  action,
  entityType,
  entityId,
  userId,
  userEmail,
  changes = null,
  details = null,
  request = null,
}) {
  try {
    if (!sql) {
      console.warn('Audit logging disabled: database not configured');
      return;
    }

    // Extract IP address from request headers
    let ipAddress = 'unknown';
    if (request) {
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
    }

    const userAgent = request?.headers.get('user-agent') || null;

    await sql(
      `INSERT INTO stock_audit_logs (action, entityType, entityId, userId, userEmail, changes, details, ipAddress, userAgent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        action,
        entityType,
        entityId,
        userId,
        userEmail,
        changes ? JSON.stringify(changes) : null,
        details,
        ipAddress,
        userAgent,
      ]
    );
  } catch (error) {
    console.error('Failed to log audit:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Retrieve audit logs with filtering
 */
export async function getAuditLogs({
  action = null,
  entityType = null,
  userEmail = null,
  limit = 100,
  offset = 0,
}) {
  try {
    if (!sql) {
      console.warn('Audit logs: database not configured');
      return [];
    }

    let query = 'SELECT * FROM stock_audit_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (action) {
      query += ` AND action = $${paramCount++}`;
      params.push(action);
    }

    if (entityType) {
      query += ` AND entityType = $${paramCount++}`;
      params.push(entityType);
    }

    if (userEmail) {
      query += ` AND userEmail = $${paramCount++}`;
      params.push(userEmail);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    return await sql(query, params);
  } catch (error) {
    console.error('Failed to retrieve audit logs:', error);
    return [];
  }
}

```


---
### FILE: ./lib/stock-document-client.js
```javascript
export const imageOnlyStockDocumentTypes = new Set([
  'transporter_bill',
  'gatepass',
  'delivery_receipt',
  'customer_acknowledgement',
]);

export function isImageOnlyStockDocument(documentType) {
  return imageOnlyStockDocumentTypes.has(documentType);
}

export function getStockDocumentFileAccept(documentType) {
  return isImageOnlyStockDocument(documentType)
    ? 'image/*'
    : '.pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv,.doc,.docx';
}

export async function compressStockImageFile(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const compressedBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));

  if (!compressedBlob) {
    return file;
  }

  const compressedFileName = `${file.name.replace(/\.[^.]+$/, '')}.webp`;
  return new File([compressedBlob], compressedFileName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export async function prepareStockDocumentFile(file, documentType) {
  if (isImageOnlyStockDocument(documentType)) {
    return compressStockImageFile(file);
  }

  return file;
}
```


---
### FILE: ./lib/stock-workflow.js
```javascript
import crypto from 'crypto';
import { auth0 } from '@/lib/auth0';
import { sql } from '@/lib/db';

export const STOCK_ROLES = ['admin', 'manager', 'stock_maintainer', 'salesperson'];

export function normalizeStockRole(role) {
  const rawRole = normalizeText(role).toLowerCase();

  if (rawRole === 'admin') return 'admin';
  if (rawRole === 'manager' || rawRole === 'stock_approver') return 'manager';
  if (rawRole === 'salesperson' || rawRole === 'sales_person' || rawRole === 'sales') return 'salesperson';
  return 'stock_maintainer';
}

export function getRoleFlags(role) {
  const normalizedRole = normalizeStockRole(role);

  return {
    role: normalizedRole,
    canManageUsers: normalizedRole === 'admin' || normalizedRole === 'manager',
    canApproveChanges: normalizedRole === 'admin' || normalizedRole === 'manager',
    canViewDashboard: true,
    canCreateDispatch: normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'stock_maintainer' || normalizedRole === 'salesperson',
    isReadOnly: normalizedRole === 'salesperson',
    canApprove: normalizedRole === 'admin' || normalizedRole === 'manager',
  };
}

export function hasAnyStockRole(appUser, allowedRoles = []) {
  if (!appUser) return false;
  return allowedRoles.includes(normalizeStockRole(appUser.role));
}

export function generateReference(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${suffix}`;
}

export function normalizeText(value) {
  return value ? String(value).trim().replace(/\s+/g, ' ') : '';
}

export async function getStockContext(request) {
  const session = await auth0.getSession(request);

  if (!session) {
    return { session: null, appUser: null };
  }

  try {
    const rows = await sql(
      `SELECT *
       FROM stock_app_users
       WHERE auth0_sub = $1 OR email = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [session.user.sub, session.user.email]
    );

    return { session, appUser: rows[0] || null };
  } catch (error) {
    return { session, appUser: null };
  }
}

export async function ensureDatabaseAvailable() {
  try {
    await sql('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

export async function upsertNamedRecord({ table, column = 'name', value, extra = {} }) {
  const cleanValue = normalizeText(value);

  if (!cleanValue) {
    throw new Error(`Missing value for ${table}.${column}`);
  }

  const fields = [column, ...Object.keys(extra)];
  const params = [cleanValue, ...Object.values(extra)];
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
  const updates = fields.map((field) => `${field} = EXCLUDED.${field}`).join(', ');

  const rows = await sql(
    `INSERT INTO ${table} (${fields.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (${column}) DO UPDATE SET ${updates}, updated_at = NOW()
     RETURNING *`,
    params
  );

  return rows[0];
}

export async function recordTimelineEvent({
  eventType,
  entityType,
  entityId,
  summary,
  details = null,
  userId = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_timeline_events (event_number, event_type, entity_type, entity_id, recorded_by_user_id, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [generateReference('EVT'), eventType, entityType, entityId || null, userId, summary, details ? JSON.stringify(details) : null]
  );

  return rows[0];
}

export async function queueNotification({
  channel = 'whatsapp',
  eventType,
  messageText,
  recipients = [],
  sourceTable = null,
  sourceId = null,
  createdBy = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_notifications (
      notification_number,
      channel,
      event_type,
      recipients,
      message_text,
      status,
      source_table,
      source_id,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      generateReference('NTF'),
      channel,
      eventType,
      JSON.stringify(recipients),
      messageText,
      'queued',
      sourceTable,
      sourceId,
      createdBy,
    ]
  );

  return rows[0];
}

export async function collectNotificationRecipients() {
  try {
    const [appUsers, salesPeople] = await Promise.all([
      sql(
        `SELECT name, phone, email, role
         FROM stock_app_users
         WHERE status = 'active'`,
        []
      ),
      sql(
        `SELECT name, phone, whatsapp_phone, email
         FROM stock_sales_people
         WHERE is_active = TRUE`,
        []
      ),
    ]);

    return [
      ...appUsers.map((user) => ({
        kind: 'user',
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      })),
      ...salesPeople.map((person) => ({
        kind: 'sales_person',
        name: person.name,
        phone: person.phone,
        whatsapp_phone: person.whatsapp_phone,
        email: person.email,
      })),
    ];
  } catch (error) {
    return [];
  }
}

export function bufferToDataUrl(buffer, mimeType) {
  const safeMimeType = mimeType || 'application/octet-stream';
  return `data:${safeMimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

export async function readUploadFile(uploadedFile) {
  const arrayBuffer = await uploadedFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    dataUrl: bufferToDataUrl(buffer, uploadedFile.type),
    fileName: uploadedFile.name,
    mimeType: uploadedFile.type || 'application/octet-stream',
    fileSizeBytes: buffer.length,
    checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

export async function insertStockDocument({
  documentType,
  entityType,
  entityId,
  fileName,
  fileUrl,
  mimeType,
  fileSizeBytes,
  checksum,
  notes = null,
  createdBy = null,
  documentNumber = null,
}) {
  const rows = await sql(
    `INSERT INTO stock_documents (
      document_number,
      document_type,
      entity_type,
      entity_id,
      file_name,
      file_url,
      mime_type,
      file_size_bytes,
      checksum,
      notes,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      documentNumber,
      documentType,
      entityType,
      entityId || null,
      fileName,
      fileUrl,
      mimeType,
      fileSizeBytes,
      checksum,
      notes,
      createdBy,
    ]
  );

  return rows[0];
}

export async function linkDocumentToEntity({ document, documentType, entityType, entityId, documentNumber }) {
  if (entityType === 'inbound_shipment') {
    if (documentType === 'purchase_invoice') {
      await sql(
        `UPDATE stock_inbound_shipments
         SET invoice_document_id = $1,
             invoice_number = COALESCE($2, invoice_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'transporter_bill') {
      await sql(
        `UPDATE stock_inbound_shipments
         SET transporter_bill_document_id = $1,
             transporter_bill_number = COALESCE($2, transporter_bill_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }
  }

  if (entityType === 'outbound_shipment') {
    if (documentType === 'gatepass') {
      await sql(
        `UPDATE stock_outbound_shipments
         SET gatepass_document_id = $1,
             gatepass_number = COALESCE($2, gatepass_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'sales_invoice') {
      await sql(
        `UPDATE stock_outbound_shipments
         SET invoice_document_id = $1,
             invoice_number = COALESCE($2, invoice_number),
             updated_at = NOW()
         WHERE id = $3`,
        [document.id, documentNumber || null, entityId]
      );
    }

    if (documentType === 'delivery_receipt' || documentType === 'customer_acknowledgement') {
      const ackRows = await sql(
        `INSERT INTO stock_customer_acknowledgements (
          outbound_shipment_id,
          acknowledgement_status,
          acknowledged_at,
          photo_url,
          notes
        ) VALUES ($1, 'received', NOW(), $2, $3)
        RETURNING *`,
        [entityId, document.file_url, document.notes || null]
      );

      await sql(
        `UPDATE stock_outbound_shipments
         SET customer_acknowledgement_id = $1,
             customer_acknowledged_at = COALESCE(customer_acknowledged_at, NOW()),
             updated_at = NOW()
         WHERE id = $2`,
        [ackRows[0].id, entityId]
      );
    }
  }

  return document;
}

```


---
### FILE: ./postcss.config.js
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

```
