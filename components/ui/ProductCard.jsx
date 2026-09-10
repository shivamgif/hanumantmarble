"use client"

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductCard({ product }) {
  const { addItem } = useCart();

  const handleAddToCart = () => {
    addItem({
      id: product.id,
      name: product.title || product.name,
      price: product.price,
      image: product.image || product.mainImage,
      currency: "INR",
    });
  };

  const name = product.title || product.name;

  // ponytail: stretched-link card. The title's ::after covers the whole card so
  // the card stays clickable, without nesting a <button> inside an <a>.
  return (
    <Card className="group relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-shadow duration-300">
      <CardHeader className="p-0">
        <div className="relative h-48 sm:h-64 overflow-hidden bg-gradient-to-br from-muted to-muted/50">
          <Image
            src={product.image || product.mainImage}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
          />

          {product.category && (
            <Badge className="absolute top-3 left-3 bg-primary/90 text-primary-foreground border-0">
              {product.category}
            </Badge>
          )}

          {product.rating && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 dark:bg-black/70 text-sm font-medium">
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              {product.rating}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <CardTitle className="text-base sm:text-lg font-semibold tracking-tight line-clamp-1">
          <Link
            href={`/products/${product.slug || product.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
          >
            {name}
          </Link>
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {product.description}
        </p>
        {product.variants && product.variants.length > 1 && (
          <p className="text-xs text-primary mt-2 font-medium">
            {product.variants.length} variants available
          </p>
        )}
      </CardContent>

      {/* ponytail: price intentionally not shown on the landing card — it still
          flows through to the cart and the product detail page. */}
      <CardFooter className="flex items-center gap-3 p-4 sm:p-5 pt-0">
        <Button
          onClick={handleAddToCart}
          variant="outline"
          aria-label={`Add ${name} to cart`}
          className="relative z-10 flex-1 rounded-full border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors duration-200"
        >
          Add to Cart
        </Button>
        <span className="text-sm font-medium text-primary whitespace-nowrap" aria-hidden="true">
          View details
        </span>
      </CardFooter>
    </Card>
  );
}
