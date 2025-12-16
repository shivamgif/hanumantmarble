"use client"

import { Auth0Provider } from '@auth0/nextjs-auth0/client';
import { CartProvider } from './CartContext'

export function ClientProviders({ children }) {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_AUTH0_BASE_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

  return (
    <Auth0Provider domain={domain} clientId={clientId} authorizationParams={{ redirect_uri: redirectUri }}>
      <CartProvider>
        {children}
      </CartProvider>
    </Auth0Provider>
  )
}
