"use client";

import { ArrowRight, Clock, Users, Package, Store, FileText } from "lucide-react";
import { CatalogueViewer } from "./catalogue-viewer";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

const stats = [
  { value: "30+", label: "Years Experience" },
  { value: "40+", label: "Employees" },
  { value: "500+", label: "Products" },
  { value: "4", label: "Showrooms" }
];

export function ProductShowcase({
  productShowcases = [
    {
      title: "Premium Tiles",
      description: "Crafted with passion, the digital vitrified tiles feature extraordinary aesthetic appeal and supreme quality.",
      image: "/product3.png",
    },
    {
      title: "Sanitaryware",
      description: "Exceptionally designed products for your home. Easy to clean rimless design for utmost hygiene",
      image: "/product0.png",
    },
    {
      title: "Wall Tiles",
      description: "Stunning wall tiles that transform your space with elegant designs and durable finishes.",
      image: "/product1.png",
    },
    {
      title: "Floor Tiles",
      description: "High-performance floor tiles combining aesthetic beauty with exceptional durability and strength.",
      image: "/product2.png",
    },
  ],
}) {
  const [statsRef, isStatsInView] = useInView({ threshold: 0.2 });
  const [productsRef, isProductsInView] = useInView({ threshold: 0.2 });
  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });

  return (
    <section className="relative bg-background text-foreground py-16">
      <div className="container mx-auto px-4">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-16">
          <div className={cn(
            "grid grid-cols-2 md:grid-cols-4 gap-8 p-8 bg-primary/5 rounded-2xl hover-lift fade-on-scroll",
            isStatsInView ? 'in-view' : ''
          )}>
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
          </div>
        </div>

        {/* Heading */}
        <div ref={titleRef}>
          <h2 className={cn(
            "text-4xl font-bold text-center mb-12 animate-on-scroll",
            isTitleInView ? 'in-view' : ''
          )}>
            Branded Products
            <div className={cn(
              "h-1 w-20 bg-primary mx-auto mt-4 rounded-full scale-on-scroll",
              isTitleInView ? 'in-view' : ''
            )}></div>
          </h2>
        </div>

        {/* Product Grid */}
        <div ref={productsRef} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {productShowcases.map((product, index) => (
            <div
              key={index}
              className={cn(
                "relative overflow-hidden rounded-lg border border-border group cursor-pointer hover-lift fade-on-scroll",
                isProductsInView ? 'in-view' : ''
              )}
              style={{ transitionDelay: `${index * 200}ms` }}
            >
              <div className="relative h-80">
                <img
                  src={product.image}
                  alt={product.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 group-hover:opacity-90" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white transform transition-transform duration-300 group-hover:translate-y-[-8px]">
                <h3 className={cn(
                  "text-2xl font-bold mb-2 animate-on-scroll",
                  isProductsInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 200 + 200}ms` }}>{product.title}</h3>
                <p className={cn(
                  "text-white/80 mb-4 animate-on-scroll",
                  isProductsInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 200 + 400}ms` }}>{product.description}</p>
                <div className="flex gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <CatalogueViewer />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
