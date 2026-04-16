"use client"

import { AuthProvider } from '@/lib/auth-client';
import { CartProvider } from './CartContext'

export function ClientProviders({ children }) {
  return (
    <AuthProvider>
      <CartProvider>
        {children}
      </CartProvider>
    </AuthProvider>
  )
}