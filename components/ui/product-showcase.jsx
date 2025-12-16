"use client";

import { ArrowRight, Clock, Users, Package, Store, FileText, Award } from "lucide-react";
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
    icon: <Clock className="w-7 h-7" />,
    color: "from-blue-500 to-cyan-500",
  },
  {
    value: "40+",
    key: "employees",
    icon: <Users className="w-7 h-7" />,
    color: "from-violet-500 to-purple-500",
  },
  {
    value: "500+",
    key: "products",
    icon: <Package className="w-7 h-7" />,
    color: "from-orange-500 to-amber-500",
  },
  {
    value: "4",
    key: "showrooms",
    icon: <Store className="w-7 h-7" />,
    color: "from-emerald-500 to-green-500",
  },
];

function Stat({ icon, value, label, inView, delay, color }) {
  return (
    <div
      className={cn(
        "text-center animate-on-scroll group",
        inView ? "in-view" : ""
      )}
      style={{ transitionDelay: delay }}
    >
      <div className="flex flex-col items-center">
        <div className={cn(
          "mb-3 sm:mb-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br text-white shadow-lg transform transition-transform duration-300 group-hover:scale-110",
          color
        )}>
          {icon}
        </div>
        <div className="text-2xl sm:text-4xl font-bold text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground mt-1 font-medium">{label}</div>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  const { language } = useLanguage();

  // These are actually brands we carry in-store, each with its own catalogue
  const brands = [
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4g",
      key: "premiumTiles",
      image: "/Varmora.png",
      brand: "Varmora",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4h",
      key: "sanitaryware",
      image: "/Cera.png",
      brand: "Cera",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4i",
      key: "wallTiles",
      image: "/Kajaria.png",
      brand: "Kajaria",
    },
    {
      id: "price_1J9XqG2eZvKYlo2CgXp8fJ4j",
      key: "floorTiles",
      image: "/Kajaria Eternity.png",
      brand: "Kajaria Eternity",
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
    <section id="brands" className="relative bg-gradient-to-b from-muted/50 via-background to-muted/30 text-foreground py-12 sm:py-20 overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-20">
          <Card className={cn(
            "p-4 sm:p-8 md:p-12 bg-card/80 backdrop-blur-sm border-0 shadow-xl fade-on-scroll",
            isStatsInView ? "in-view" : ""
          )}>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 md:gap-12 p-0">
              {stats.map((stat, index) => (
                <Stat
                  key={index}
                  icon={stat.icon}
                  value={stat.value}
                  label={stat.label}
                  inView={isStatsInView}
                  delay={`${index * 100}ms`}
                  color={stat.color}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Heading */}
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <Award className="w-4 h-4" />
            Trusted Partners
          </div>
          <h2 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('products.sectionTitle', language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto px-4 sm:px-0 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            We partner with India's leading tile and sanitaryware brands
          </p>
          <div className={cn(
            "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}></div>
        </div>

        {/* Brands Section (with Catalogue Viewer) */}
        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {brands.map((b, index) => (
            <div
              key={b.brand}
              className={cn(
                "animate-on-scroll",
                isProductsInView ? "in-view" : ""
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <Card className="group overflow-hidden h-full flex flex-col border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                <CardHeader className="p-0">
                  <div className="relative h-48 bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
                    <img
                      src={b.image}
                      alt={b.brand}
                      className="h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-110"
                    />
                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full" style={{ transitionDuration: '700ms' }} />
                  </div>
                </CardHeader>
                <CardContent className="p-5 flex-1">
                  <CardTitle className="text-xl font-semibold tracking-tight">{b.brand}</CardTitle>
                  <CardDescription className="mt-2 text-sm line-clamp-2">
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
