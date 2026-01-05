"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Trash2, ShoppingCart, ArrowRight, Sparkles, Package, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAllProducts } from '@/lib/products';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';

function WishlistPage() {
  const { user, isLoading } = useUser();
  const { language } = useLanguage();
  const { addItem } = useCart();
  const allProducts = getAllProducts();
  
  // Initialize with some products from the actual catalog
  const [wishlistItems, setWishlistItems] = useState(
    allProducts.slice(0, 3).map(p => ({
      id: p.id,
      slug: p.slug,
      name: language === 'hi' ? p.nameHi : p.name,
      price: p.price,
      image: p.mainImage,
      category: language === 'hi' ? p.categoryHi : p.category,
      rating: p.rating
    }))
  );
  const [removingId, setRemovingId] = useState(null);

  const removeFromWishlist = (id) => {
    setRemovingId(id);
    setTimeout(() => {
      setWishlistItems(wishlistItems.filter(item => item.id !== id));
      setRemovingId(null);
    }, 300);
  };

  const handleAddToCart = (item) => {
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      currency: "INR",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your wishlist...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <Heart className="w-4 h-4 mr-2 fill-current" />
            {language === 'hi' ? 'सेव किए गए आइटम' : 'Saved Items'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {language === 'hi' ? 'मेरी विशलिस्ट' : 'My Wishlist'}
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {wishlistItems.length > 0 
              ? language === 'hi' 
                ? `आपने ${wishlistItems.length} आइटम बाद के लिए सेव किए हैं`
                : `You have ${wishlistItems.length} item${wishlistItems.length !== 1 ? 's' : ''} saved for later`
              : language === 'hi' 
                ? 'अपने पसंदीदा आइटम यहां सेव करें'
                : 'Save your favorite items here'
            }
          </p>
        </div>

        {wishlistItems.length === 0 ? (
          /* Empty State */
          <Card className="max-w-md mx-auto bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <CardContent className="p-12 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
              <div className="relative">
                <div className="relative mx-auto w-24 h-24 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-30" />
                  <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <Heart className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {language === 'hi' ? 'आपकी विशलिस्ट खाली है' : 'Your wishlist is empty'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {language === 'hi' 
                    ? 'हमारे कलेक्शन को एक्सप्लोर करें और अपने पसंदीदा आइटम सेव करें!'
                    : 'Start exploring our collection and save items you love!'
                  }
                </p>
                <Button className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all duration-300" asChild>
                  <Link href="/#products" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {language === 'hi' ? 'उत्पाद देखें' : 'Explore Products'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Wishlist Items Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlistItems.map((item, index) => (
              <Card 
                key={item.id} 
                className={cn(
                  "group bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden",
                  removingId === item.id ? "scale-95 opacity-0" : "hover:-translate-y-2"
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-0 relative">
                  {/* Image Section */}
                  <Link href={`/products/${item.slug}`}>
                    <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Package className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Category Badge */}
                      <Badge 
                        className="absolute top-3 left-3 bg-primary/90 text-primary-foreground backdrop-blur-sm"
                      >
                        {item.category}
                      </Badge>

                      {/* Heart Icon */}
                      <div className="absolute top-3 right-3">
                        <div className="h-10 w-10 rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
                          <Heart className="h-5 w-5 text-primary fill-primary" />
                        </div>
                      </div>

                      {/* Quick Actions on Hover */}
                      <div className="absolute bottom-3 left-3 right-3 flex gap-2 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <Button 
                          size="sm" 
                          className="flex-1 rounded-full bg-white text-black hover:bg-white/90 shadow-lg"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAddToCart(item);
                          }}
                        >
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Add to Cart
                        </Button>
                      </div>
                    </div>
                  </Link>

                  {/* Content Section */}
                  <div className="p-5">
                    {/* Rating */}
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-medium">{item.rating}</span>
                    </div>

                    <Link href={`/products/${item.slug}`}>
                      <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors line-clamp-1">{item.name}</h3>
                    </Link>
                    <p className="text-2xl font-bold text-primary mb-4">₹{item.price.toLocaleString()}</p>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="default"
                        className="flex-1 rounded-full"
                        onClick={() => handleAddToCart(item)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Cart
                      </Button>
                      <Button 
                        variant="outline"
                        size="icon"
                        className="rounded-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors"
                        onClick={() => removeFromWishlist(item.id)}
                        title="Remove from wishlist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Continue Shopping CTA */}
        {wishlistItems.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" className="rounded-full px-8" asChild>
              <Link href="/#products" className="flex items-center gap-2">
                {language === 'hi' ? 'खरीदारी जारी रखें' : 'Continue Shopping'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withPageAuthRequired(WishlistPage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
