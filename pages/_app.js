import '@/styles/globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/contexts/LanguageContext'
import Layout from '@/components/Layout'

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="system" 
        enableSystem 
        disableTransitionOnChange
      >
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </ThemeProvider>
    </LanguageProvider>
  )
}
