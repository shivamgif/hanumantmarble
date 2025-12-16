import '@/styles/globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/contexts/LanguageContext'
import Layout from '@/components/Layout'
import { getTranslation } from '@/lib/translations'

export const metadata = {
  title: getTranslation('meta.title', 'en'),
  description: getTranslation('meta.description', 'en'),
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LanguageProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Layout>
              {children}
            </Layout>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
