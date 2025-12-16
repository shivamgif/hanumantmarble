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
