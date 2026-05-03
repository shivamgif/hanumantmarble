import '@/styles/globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ClientProviders } from '@/contexts/ClientProviders'
import Layout from '@/components/Layout'
import PWAInstall from '@/components/PWAInstall'
import HapticProvider from '@/components/HapticProvider'

const BASE_URL = "https://hanumantmarble.com";

export const viewport = {
  themeColor: '#E07A00',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata = {
  manifest: "/manifest.json",
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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hanumant Marble',
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
        <HapticProvider />
        <PWAInstall />
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
