"use client"

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Star, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductCard({ product }) {
  const { addItem } = useCart();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: product.id,
      name: product.title || product.name,
      price: product.price,
      image: product.image || product.mainImage,
      currency: "INR",
    });
  };

  return (
    <Link href={`/products/${product.slug || product.id}`}>
      <Card className="group overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
        <CardHeader className="p-0">
          <div className="relative h-48 sm:h-64 overflow-hidden bg-gradient-to-br from-muted to-muted/50">
            <Image
              src={product.image || product.mainImage}
              alt={product.title || product.name}
              fill
              className="object-contain p-4 transition-transform duration-700 group-hover:scale-110"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Category Badge */}
            {product.category && (
              <Badge className="absolute top-3 left-3 bg-primary/90 text-primary-foreground border-0">
                {product.category}
              </Badge>
            )}

            {/* Rating Badge */}
            {product.rating && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-black/70 text-sm font-medium">
                <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                {product.rating}
              </div>
            )}

            {/* Quick actions on hover */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 flex gap-2">
              <Button 
                onClick={handleAddToCart}
                size="sm"
                className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Quick Add
              </Button>
              <Button 
                size="sm"
                variant="secondary"
                className="rounded-full shadow-lg bg-white/90 dark:bg-black/70 hover:bg-white dark:hover:bg-black"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <CardTitle className="text-base sm:text-lg font-semibold tracking-tight line-clamp-1">
            {product.title || product.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {product.description}
          </p>
          {/* Variants indicator */}
          {product.variants && product.variants.length > 1 && (
            <p className="text-xs text-primary mt-2 font-medium">
              {product.variants.length} variants available
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 sm:p-5 pt-0">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Price</span>
            <span className="font-bold text-lg sm:text-xl text-foreground">
              ₹{product.price.toLocaleString()}
            </span>
          </div>
          <Button 
            onClick={handleAddToCart} 
            variant="outline"
            className="rounded-full border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300"
          >
            Add to Cart
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
}
