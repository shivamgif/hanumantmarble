"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { ProductCard } from "./ProductCard";
import { SectionHeading } from "./section-heading";
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

  const [gridRef, isGridInView] = useInView({ threshold: 0.2 });

  return (
    <section id="products" className="relative bg-muted/25 text-foreground py-16 sm:py-24 overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <SectionHeading
          align="center"
          className="mb-16"
          eyebrow={language === 'hi' ? 'ऑनलाइन खरीदें' : 'Shop Online'}
          icon={<Sparkles className="w-4 h-4" />}
          title={getTranslation("shop.sectionTitle", language)}
          subtitle={
            language === 'hi'
              ? 'टाइल इंस्टॉलेशन के लिए प्रीमियम एडहेसिव, ग्राउट और एक्सेसरीज़'
              : 'Premium adhesives, grouts, and accessories for tile installation'
          }
        />

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
