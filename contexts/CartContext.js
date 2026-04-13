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
