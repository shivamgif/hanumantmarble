"use client"

import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductCard({ product }) {
  const { addItem } = useCart();

  const handleAddToCart = () => {
    addItem({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.image,
      currency: "INR",
    });
  };

  return (
    <Card className="group overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
      <CardHeader className="p-0">
        <div className="relative h-48 sm:h-64 overflow-hidden">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          {/* Quick add button on hover */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
            <Button 
              onClick={handleAddToCart}
              size="sm"
              className="rounded-full shadow-lg bg-primary hover:bg-primary/90"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Quick Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">{product.title}</CardTitle>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{product.description}</p>
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
  );
}
