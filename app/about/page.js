"use client"

import Image from "next/image";
import { Award, Star, Building2 } from "lucide-react";
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

  const awardsData = getTranslation('about.awards.list', language);
  const awards = Array.isArray(awardsData) ? awardsData : [];

  return (
    <div className="relative overflow-hidden">
      {/* Background decorations */}
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
            "font-semibold tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-5xl animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "80ms" }}>
            {getTranslation('about.title', language)}
          </h1>

          <p className={cn(
            "text-base sm:text-lg md:text-xl text-muted-foreground mx-auto max-w-3xl leading-relaxed animate-on-scroll",
            isHeroInView ? "in-view" : ""
          )} style={{ transitionDelay: "160ms" }}>
            {getTranslation('about.intro', language)}
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className={cn(
              "group rounded-xl border border-border bg-card p-5 sm:p-8 text-card-foreground shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "240ms" }}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Star className="w-5 h-5 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="font-semibold text-lg mb-3">Our Commitment</h3>
              <p className="leading-relaxed text-muted-foreground">
                {getTranslation('about.commitment', language)}
              </p>
            </div>
            <div className={cn(
              "group rounded-xl border border-border bg-card p-5 sm:p-8 text-card-foreground shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-on-scroll",
              isHeroInView ? "in-view" : ""
            )} style={{ transitionDelay: "320ms" }}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5 text-primary" strokeWidth={1.75} />
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
              Showcase
            </div>
            <h2 className={cn(
              "font-semibold tracking-tight text-2xl sm:text-3xl md:text-4xl animate-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "80ms" }}>
              {getTranslation('about.gallery.title', language)}
            </h2>
            <div className={cn(
              "h-px w-16 bg-primary mx-auto mt-5 scale-on-scroll",
              isGalleryInView ? "in-view" : ""
            )} style={{ transitionDelay: "160ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div 
                key={index} 
                className={cn(
                  "group relative h-72 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-on-scroll",
                  isGalleryInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${240 + Math.min(index, 3) * 80}ms` }}
              >
                <Image
                  src={image}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute bottom-4 left-4 right-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition duration-300">
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
              "font-semibold tracking-tight text-2xl sm:text-3xl md:text-4xl animate-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "80ms" }}>
              {getTranslation('about.awards.title', language)}
            </h2>
            <div className={cn(
              "h-px w-16 bg-primary mx-auto mt-5 scale-on-scroll",
              isAwardsInView ? "in-view" : ""
            )} style={{ transitionDelay: "160ms" }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award, index) => (
              <div
                key={index}
                className={cn(
                  "group relative rounded-xl border border-border bg-card p-5 sm:p-8 text-card-foreground shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-on-scroll overflow-hidden",
                  isAwardsInView ? "in-view" : ""
                )}
                style={{ transitionDelay: `${240 + Math.min(index, 3) * 80}ms` }}
              >
                <Badge variant="outline" className="mb-4 border-primary/30 text-primary tabular-nums">
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
