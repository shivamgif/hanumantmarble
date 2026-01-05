"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { ProductCard } from "./ProductCard";
import { getAllProducts } from "@/lib/products";

export function ProductsGrid() {
  const { language } = useLanguage();
  const allProducts = getAllProducts();

  // Map products to display format with language support
  const products = allProducts.map(product => ({
    id: product.id,
    slug: product.slug,
    name: language === 'hi' ? product.nameHi : product.name,
    title: language === 'hi' ? product.nameHi : product.name,
    description: language === 'hi' ? product.descriptionHi : product.description,
    image: product.mainImage,
    mainImage: product.mainImage,
    price: product.price,
    category: language === 'hi' ? product.categoryHi : product.category,
    rating: product.rating,
    variants: product.variants,
  }));

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
            {language === 'hi' ? 'ऑनलाइन खरीदें' : 'Shop Online'}
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
            {language === 'hi' 
              ? 'टाइल इंस्टॉलेशन के लिए प्रीमियम एडहेसिव, ग्राउट और एक्सेसरीज़'
              : 'Premium adhesives, grouts, and accessories for tile installation'
            }
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
        >
          {products.map((product, index) => (
            <div
              key={product.id}
              className={cn(
                "animate-on-scroll",
                isGridInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
