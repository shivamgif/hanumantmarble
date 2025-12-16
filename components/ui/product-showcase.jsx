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

const statsData = [
  {
    value: "30+",
    key: "yearsExperience",
    icon: <Clock className="w-8 h-8 text-primary" />,
  },
  {
    value: "40+",
    key: "employees",
    icon: <Users className="w-8 h-8 text-primary" />,
  },
  {
    value: "500+",
    key: "products",
    icon: <Package className="w-8 h-8 text-primary" />,
  },
  {
    value: "4",
    key: "showrooms",
    icon: <Store className="w-8 h-8 text-primary" />,
  },
];

function Stat({ icon, value, label, inView, delay }) {
  return (
    <div
      className={cn(
        "text-center animate-on-scroll",
        inView ? "in-view" : ""
      )}
      style={{ transitionDelay: delay }}
    >
      <div className="flex flex-col items-center">
        <div className={cn("mb-3 float-on-scroll", inView ? "in-view" : "")}>
          {icon}
        </div>
        <div className="text-4xl font-bold text-primary">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

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

  const stats = statsData.map((stat) => ({
    ...stat,
    label: getTranslation(`stats.${stat.key}`, language),
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
            isStatsInView ? "in-view" : ""
          )}>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-8 p-0">
              {stats.map((stat, index) => (
                <Stat
                  key={index}
                  icon={stat.icon}
                  value={stat.value}
                  label={stat.label}
                  inView={isStatsInView}
                  delay={`${index * 100}ms`}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Heading */}
        <div ref={titleRef}>
          <h2 className={cn(
            "text-4xl font-bold text-center mb-12 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            {getTranslation('products.sectionTitle', language)}
            <div className={cn(
              "h-1 w-20 bg-primary mx-auto mt-4 rounded-full scale-on-scroll",
              isTitleInView ? "in-view" : ""
            )}></div>
          </h2>
        </div>

        {/* Products Section */}
        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {productShowcases.map((product, index) => (
            <div
              key={index}
              className={cn(
                "animate-on-scroll",
                isProductsInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <Card className="overflow-hidden h-full hover-lift">
                <CardHeader className="p-0">
                  <div className="relative h-64">
                    <img
                      src={product.image}
                      alt={getTranslation(`products.${product.key}.title`, language)}
                      className="object-cover w-full h-full"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <CardTitle className="mb-2">{getTranslation(`products.${product.key}.title`, language)}</CardTitle>
                  <CardDescription>{getTranslation(`products.${product.key}.description`, language)}</CardDescription>
                </CardContent>
                <CardFooter className="p-6 pt-0">
                  <CatalogueViewer brand={product.brand} />
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
