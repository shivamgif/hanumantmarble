"use client"

import Image from "next/image";
import { Award, Star, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

export default function About() {
  const { language } = useLanguage();
  const [heroRef, isHeroInView] = useInView({ threshold: 0.2 });
  const [galleryRef, isGalleryInView] = useInView({ threshold: 0.1 });
  const [awardsRef, isAwardsInView] = useInView({ threshold: 0.2 });

  const galleryImages = [
    "/gallery1.jpeg",
    "/gallery2.jpeg",
    "/gallery3.jpeg",
    "/gallery4.jpeg",
    "/gallery5.jpeg",
    "/gallery6.jpeg",
  ];

  const awards = getTranslation('about.awards.list', language);

  return (
    <div className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-12 sm:py-20 space-y-16 sm:space-y-24 relative z-10">
        {/* Hero Section */}
        <section ref={heroRef} className="text-center space-y-12">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )}>
            <Building2 className="w-4 h-4" />
            Our Story
          </div>

          <h1 className={cn(
            "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('about.title', language)}
          </h1>

          <p className={cn(
            "text-base sm:text-lg md:text-xl text-muted-foreground mx-auto max-w-3xl leading-relaxed animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            {getTranslation('about.intro', language)}
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className={cn(
              "group rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "300ms" }}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-3">Our Commitment</h3>
              <p className="leading-relaxed text-muted-foreground">
                {getTranslation('about.commitment', language)}
              </p>
            </div>
            <div className={cn(
              "group rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "400ms" }}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-3">Our Facility</h3>
              <p className="leading-relaxed text-muted-foreground">
                {getTranslation('about.facility', language)}
              </p>
            </div>
          </div>
        </section>

        {/* Gallery Section */}
        <section ref={galleryRef} className="space-y-12">
          <div className="text-center">
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
              isGalleryInView ? "in-view" : ""
            )}>
              <Sparkles className="w-4 h-4" />
              Showcase
            </div>
            <h2 className={cn(
              "text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight animate-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "100ms" }}>
              {getTranslation('about.gallery.title', language)}
            </h2>
            <div className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-4 rounded-full scale-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "200ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div 
                key={index} 
                className={cn(
                  "group relative h-72 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll",
                  isGalleryInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                <Image
                  src={image}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="absolute bottom-4 left-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <p className="text-white font-medium">Premium Collection {index + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Awards Section */}
        <section ref={awardsRef} className="space-y-12">
          <div className="text-center">
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
              isAwardsInView ? "in-view" : ""
            )}>
              <Award className="w-4 h-4" />
              Recognition
            </div>
            <h2 className={cn(
              "text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight animate-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "100ms" }}>
              {getTranslation('about.awards.title', language)}
            </h2>
            <div className={cn(
              "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-4 rounded-full scale-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "200ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award, index) => (
              <div
                key={index}
                className={cn(
                  "group relative rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 text-card-foreground shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-on-scroll overflow-hidden",
                  isAwardsInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                {/* Decorative gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                
                <Badge className="mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  {award.year}
                </Badge>
                <h3 className="text-xl font-semibold tracking-tight mb-2">{award.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {award.organization}
                </p>
                
                {/* Award icon */}
                <div className="absolute bottom-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Award className="w-16 h-16" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
