"use client"

import { IdentityProvider } from './IdentityContext'
import { CartProvider } from './CartContext'

export function ClientProviders({ children }) {
  return (
    <IdentityProvider>
      <CartProvider>
        {children}
      </CartProvider>
    </IdentityProvider>
  )
}
