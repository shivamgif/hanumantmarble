"use client";

import { ArrowRight, Clock, Users, Package, Store, FileText } from "lucide-react";
import { CatalogueViewer } from "./catalogue-viewer";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const statsValues = ["30+", "40+", "500+", "4"];

export function ProductShowcase() {
  const { language } = useLanguage();
  
  const productShowcases = [
    {
      key: "premiumTiles",
      image: "/Varmora.png",
      brand: "Varmora"
    },
    {
      key: "sanitaryware",
      image: "/Cera.png",
      brand: "Cera"
    },
    {
      key: "wallTiles",
      image: "/Kajaria.png",
      brand: "Kajaria"
    },
    {
      key: "floorTiles",
      image: "/Kajaria Eternity.png",
      brand: "Kajaria Eternity"
    },
  ];

  const stats = statsValues.map((value, index) => ({
    value,
    label: getTranslation(`stats.${['yearsExperience', 'employees', 'products', 'showrooms'][index]}`, language)
  }));
  const [statsRef, isStatsInView] = useInView({ threshold: 0.2 });
  const [productsRef, isProductsInView] = useInView({ threshold: 0.2 });
  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });

  return (
    <section className="relative bg-background text-foreground py-16">
      <div className="container mx-auto px-4">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-16">
          <Card className={cn(
            "p-8 bg-primary/5 fade-on-scroll",
            isStatsInView ? 'in-view' : ''
          )}>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-8 p-0">
              {stats.map((stat, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "text-center animate-on-scroll",
                    isStatsInView ? 'in-view' : ''
                  )}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "mb-3 float-on-scroll",
                      isStatsInView ? 'in-view' : ''
                    )}>
                      {index === 0 && <Clock className="w-8 h-8 text-primary" />}
                      {index === 1 && <Users className="w-8 h-8 text-primary" />}
                      {index === 2 && <Package className="w-8 h-8 text-primary" />}
                      {index === 3 && <Store className="w-8 h-8 text-primary" />}
                    </div>
                    <div className="text-4xl font-bold text-primary">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Heading */}
        <div ref={titleRef}>
            <h2 className={cn(
              "text-4xl font-bold text-center mb-12 animate-on-scroll",
              isTitleInView ? 'in-view' : ''
            )}>
              {getTranslation('products.sectionTitle', language)}
            <div className={cn(
              "h-1 w-20 bg-primary mx-auto mt-4 rounded-full scale-on-scroll",
              isTitleInView ? 'in-view' : ''
            )}></div>
          </h2>
        </div>

        {/* Product Grid */}
        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {productShowcases.map((product, index) => (
            <Card
              key={index}
              className={cn(
                "relative group cursor-pointer hover-lift fade-on-scroll",
                isProductsInView ? 'in-view' : ''
              )}
              style={{ transitionDelay: `${index * 200}ms` }}
            >
              <CardContent className="p-0 relative h-80">
                <img
                  src={product.image}
                  alt={product.title}
                  className=" w-full h-full transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50  to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 transform transition-transform duration-300 group-hover:translate-y-[-8px]">
                  <CardTitle className={cn(
                    "text-2xl font-bold text-white mb-2 animate-on-scroll",
                    isProductsInView ? 'in-view' : ''
                  )} style={{ transitionDelay: `${index * 200 + 200}ms` }}>
                    {getTranslation(`products.items.${product.key}.title`, language)}
                  </CardTitle>
                  <CardDescription className={cn(
                    "text-white/80 mb-4 animate-on-scroll",
                    isProductsInView ? 'in-view' : ''
                  )} style={{ transitionDelay: `${index * 200 + 400}ms` }}>
                    {getTranslation(`products.items.${product.key}.description`, language)}
                  </CardDescription>
                  <CardFooter className="p-0">
                    <CatalogueViewer brand={product.brand} />
                  </CardFooter>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
