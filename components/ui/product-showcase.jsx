"use client";

import { Clock, Users, Package, Store, Award } from "lucide-react";
import { CatalogueViewer } from "./catalogue-viewer";
import { SectionHeading } from "./section-heading";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

const statsData = [
  { value: "30+", key: "yearsExperience", icon: <Clock className="w-5 h-5" /> },
  { value: "40+", key: "employees", icon: <Users className="w-5 h-5" /> },
  { value: "500+", key: "products", icon: <Package className="w-5 h-5" /> },
  { value: "4", key: "showrooms", icon: <Store className="w-5 h-5" /> },
];

// These are brands we carry in-store, each with its own catalogue
const brands = [
  { key: "premiumTiles", image: "/Varmora.png", brand: "Varmora" },
  { key: "sanitaryware", image: "/Cera.png", brand: "Cera" },
  { key: "wallTiles", image: "/Kajaria.png", brand: "Kajaria" },
  { key: "floorTiles", image: "/Kajaria Eternity.png", brand: "Kajaria Eternity" },
];

export function ProductShowcase() {
  const { language } = useLanguage();
  const [statsRef, isStatsInView] = useInView({ threshold: 0.2 });
  const [productsRef, isProductsInView] = useInView({ threshold: 0.2 });

  return (
    <section id="brands" className="relative bg-background text-foreground py-16 sm:py-24 overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        {/* Stats — a slim rule-separated strip, not another card grid */}
        <div
          ref={statsRef}
          className="grid grid-cols-2 md:grid-cols-4 border-y border-border/60 mb-20"
        >
          {statsData.map((stat, index) => (
            <div
              key={stat.key}
              className={cn(
                "flex items-center gap-4 py-8 px-2 sm:px-6 animate-on-scroll",
                "border-border/60 md:border-l md:first:border-l-0",
                index % 2 === 1 && "border-l md:border-l",
                index > 1 && "border-t md:border-t-0",
                isStatsInView && "in-view"
              )}
              style={{ transitionDelay: `${index * 90}ms` }}
            >
              <div className="text-primary shrink-0">{stat.icon}</div>
              <div>
                <div className="font-display text-3xl sm:text-4xl leading-none">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1.5">
                  {getTranslation(`stats.${stat.key}`, language)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <SectionHeading
          align="left"
          className="mb-12"
          eyebrow="Trusted Partners"
          icon={<Award className="w-4 h-4" />}
          title={getTranslation("products.sectionTitle", language)}
          subtitle="We partner with India's leading tile and sanitaryware brands — browse their catalogues before you visit."
        />

        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {brands.map((b, index) => (
            <div
              key={b.brand}
              className={cn("animate-on-scroll", isProductsInView && "in-view")}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <Card className="group overflow-hidden h-full flex flex-col border border-border/60 bg-card shadow-none hover:border-primary/40 hover:shadow-lg transition-all duration-300">
                <CardHeader className="p-0">
                  <div className="relative h-40 bg-muted/40 overflow-hidden">
                    <img
                      src={b.image}
                      alt={b.brand}
                      className="h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-5 flex-1">
                  <CardTitle className="text-lg font-semibold tracking-tight">{b.brand}</CardTitle>
                  <CardDescription className="mt-2 text-sm line-clamp-3">
                    {getTranslation(`products.${b.key}.description`, language)}
                  </CardDescription>
                </CardContent>
                <CardFooter className="p-5 pt-0">
                  <CatalogueViewer brand={b.brand} />
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
