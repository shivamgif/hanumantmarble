"use client";

import React, { useCallback } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft } from "lucide-react";
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
            <div className="relative h-[70vh] w-full flex-shrink-0" key={index}>
              <img
                src={image}
                alt={`Hero image ${index + 1}`}
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Carousel Controls */}
      <div className="absolute bottom-8 right-8 flex gap-2 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full bg-background/20 backdrop-blur-sm border-border/10 hover:bg-background/30 hover-scale"
          onClick={scrollPrev}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full bg-background/20 backdrop-blur-sm border-border/10 hover:bg-background/30 hover-scale"
          onClick={scrollNext}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Hero Content */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4"
      >
        <Badge
          variant="outline"
          className="mb-4 bg-background/10 backdrop-blur-sm text-white border-white/20 hover-lift animate-float"
        >
          Premium Collection
        </Badge>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 animate-slide-up">
          {title}
        </h1>
        <p className="max-w-[600px] text-white/90 text-lg md:text-xl mb-8 animate-slide-up" style={{ animationDelay: '200ms' }}>
          {subtitle}
        </p>
        <div className="flex gap-4 mb-8">
          <Button
            size="lg"
            className="animate-scale-in hover-scale shimmer"
            style={{ animationDelay: '400ms' }}
          >
            <a href="/quote" className="flex items-center">
              {ctaText}
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
