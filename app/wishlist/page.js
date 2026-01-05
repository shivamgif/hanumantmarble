"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState } from 'react';
import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';

function WishlistPage() {
  const { user, isLoading } = useUser();
  const [wishlistItems, setWishlistItems] = useState([
    { id: 1, name: 'White Marble Slab', price: '$150.00', image: '/placeholder-marble.jpg' },
    { id: 2, name: 'Granite Countertop', price: '$300.00', image: '/placeholder-granite.jpg' },
  ]);

  const removeFromWishlist = (id) => {
    setWishlistItems(wishlistItems.filter(item => item.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="loading-state">
          <p className="loading-text">Loading your wishlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-primary mb-8 flex items-center gap-3">
        <Heart className="h-8 w-8" />
        My Wishlist
      </h1>
      
      {wishlistItems.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-lg shadow-lg">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-lg mb-4">Your wishlist is empty.</p>
          <Link href="/" className="button login">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlistItems.map(item => (
            <div key={item.id} className="bg-card p-6 rounded-lg shadow-md hover-lift transition-transform duration-300">
              <div className="aspect-square bg-muted rounded-lg mb-4 flex items-center justify-center">
                <Heart className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-primary mb-2">{item.name}</h3>
              <p className="text-xl font-bold text-primary mb-4">{item.price}</p>
              <div className="flex gap-2">
                <button className="button login flex-1">
                  Add to Cart
                </button>
                <button 
                  onClick={() => removeFromWishlist(item.id)}
                  className="button logout p-3"
                  title="Remove from wishlist"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default withPageAuthRequired(WishlistPage, {
  onRedirecting: () => (
    <div className="flex justify-center items-center h-screen">
      <div className="loading-state">
        <p className="loading-text">Redirecting to login...</p>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
