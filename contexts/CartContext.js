"use client"
import React, { createContext, useContext } from 'react';
import { useShoppingCart, CartProvider as USCProvider } from 'use-shopping-cart';
import { useIdentity } from './IdentityContext';

const CartContext = createContext({});

export const CartProvider = ({ children }) => {
  const { user } = useIdentity();

  return (
    <USCProvider
      mode="payment"
      cartMode="client-only"
      stripe={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
      successUrl={`${process.env.NEXT_PUBLIC_URL}/success`}
      cancelUrl={`${process.env.NEXT_PUBLIC_URL}/?success=false`}
      currency="INR"
      allowedCountries={['IN']}
      billingAddressCollection={true}
      shouldPersist={true}
      email={user?.email}
    >
      {children}
    </USCProvider>
  );
};

export const useCart = useShoppingCart;
