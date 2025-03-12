import { ThemeProvider } from '@/components/ThemeProvider'
import Layout from '@/components/Layout'
import '@/styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
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
  )
}
