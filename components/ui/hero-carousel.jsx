"use client";

import React, { useCallback } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeroCarousel({
  images = ["/hero1.png", "/hero2.jpeg", "/hero3.jpeg", "/hero4.jpeg", "/hero5.jpeg", "/hero6.jpeg"],
  title = "FOR YOUR SWEET HOME",
  subtitle = "One of the biggest collection of tiles and sanitaryware in Lucknow. Build your dream home with us.",
  ctaText = "Get Quote",
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay()]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  return (
    <section className="relative bg-background text-foreground overflow-hidden">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((image, index) => (
            <div className="relative h-[75vh] w-full flex-shrink-0" key={index}>
              <img
                src={image}
                alt={`Hero image ${index + 1}`}
                className="object-cover w-full h-full"
              />
              {/* Enhanced gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />
            </div>
          ))}
        </div>
      </div>

      {/* Carousel Controls - Enhanced */}
      <div className="absolute bottom-8 right-8 flex gap-3 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollPrev}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollNext}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Content - Enhanced */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4">
        <Badge
          variant="outline"
          className="mb-6 px-4 py-2 bg-white/10 backdrop-blur-md text-white border-white/20 hover:bg-white/20 transition-all animate-float"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Premium Collection
        </Badge>
        
        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 tracking-tight animate-slide-up">
          <span className="block">{title}</span>
        </h1>
        
        <p className="max-w-[600px] text-white/90 text-base sm:text-lg md:text-xl mb-6 sm:mb-10 leading-relaxed animate-slide-up px-4" style={{ animationDelay: '200ms' }}>
          {subtitle}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 px-4">
          <Button
            size="lg"
            className="animate-scale-in rounded-full px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg bg-white text-black hover:bg-white/90 shadow-2xl hover:shadow-white/25 hover:scale-105 transition-all duration-300"
            style={{ animationDelay: '400ms' }}
            asChild
          >
            <a href="/quote" className="flex items-center gap-2">
              {ctaText}
              <ArrowRight className="h-5 w-5" />
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="animate-scale-in rounded-full px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg bg-transparent text-white border-2 border-white/30 hover:bg-white/10 hover:border-white/50 hover:scale-105 transition-all duration-300"
            style={{ animationDelay: '500ms' }}
            asChild
          >
            <a href="#products">
              Explore Products
            </a>
          </Button>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-5 pointer-events-none" />
    </section>
  );
}
