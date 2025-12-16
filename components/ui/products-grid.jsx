"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { ProductCard } from "./ProductCard";

export function ProductsGrid() {
  const { language } = useLanguage();

  // Placeholder products for online/cart
  const products = [
    {
      id: "prod_placeholder_1",
      key: "porcelainTile",
      image: "/gallery1.jpeg",
      price: 999,
    },
    {
      id: "prod_placeholder_2",
      key: "graniteSlab",
      image: "/gallery2.jpeg",
      price: 2499,
    },
    {
      id: "prod_placeholder_3",
      key: "wallCladding",
      image: "/gallery3.jpeg",
      price: 1499,
    },
    {
      id: "prod_placeholder_4",
      key: "bathroomSet",
      image: "/gallery4.jpeg",
      price: 3299,
    },
  ];

  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });
  const [gridRef, isGridInView] = useInView({ threshold: 0.2 });

  return (
    <section id="products" className="relative bg-gradient-to-b from-background via-muted/30 to-background text-foreground py-12 sm:py-20 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <Sparkles className="w-4 h-4" />
            Shop Online
          </div>
          <h2
            className={cn(
              "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
              isTitleInView ? "in-view" : ""
            )}
            style={{ transitionDelay: "100ms" }}
          >
            {getTranslation("shop.sectionTitle", language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto px-4 sm:px-0 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            Discover our curated collection of premium tiles and marble products
          </p>
          <div
            className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
              isTitleInView ? "in-view" : ""
            )}
            style={{ transitionDelay: "300ms" }}
          ></div>
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8"
        >
          {products.map((p, index) => (
            <div
              key={p.id}
              className={cn(
                "animate-on-scroll",
                isGridInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <ProductCard
                product={{
                  ...p,
                  title: getTranslation(`shop.${p.key}.title`, language),
                  description: getTranslation(`shop.${p.key}.description`, language),
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
