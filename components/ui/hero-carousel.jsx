"use client";

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
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
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 4500, stopOnInteraction: false })]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState([]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  const scrollTo = useCallback((index) => {
    if (emblaApi) emblaApi.scrollTo(index)
  }, [emblaApi])

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    setScrollSnaps(emblaApi.scrollSnapList())
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => emblaApi.off('select', onSelect)
  }, [emblaApi, onSelect])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') scrollPrev()
      if (e.key === 'ArrowRight') scrollNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [scrollPrev, scrollNext])

  return (
    <section className="relative bg-background text-foreground overflow-hidden" aria-label="Hero carousel">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((image, index) => (
            <div className="relative h-[75vh] w-full flex-shrink-0 min-w-0" key={index}>
              <Image
                src={image}
                alt={`Hanumant Marble showroom image ${index + 1}`}
                fill
                className="object-cover"
                priority={index === 0}
                sizes="100vw"
              />
              {/* Enhanced gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {/* Carousel Controls */}
      <div className="absolute bottom-8 right-8 flex gap-3 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollPrev}
          aria-label="Previous slide"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-12 w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 hover:scale-110 transition-all duration-300 text-white"
          onClick={scrollNext}
          aria-label="Next slide"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20" role="tablist" aria-label="Slide indicators">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === selectedIndex}
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => scrollTo(index)}
            className={cn(
              "rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/60",
              index === selectedIndex
                ? "bg-white w-6 h-2.5"
                : "bg-white/40 hover:bg-white/60 w-2.5 h-2.5"
            )}
          />
        ))}
      </div>

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Hero Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4">
        <Badge
          variant="outline"
          className="mb-6 px-4 py-2 bg-white/10 backdrop-blur-md text-white border-white/20 hover:bg-white/20 transition-all animate-float"
        >
          <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
          Premium Collection
        </Badge>
        
        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 tracking-tight animate-slide-up">
          <span className="block">{title}</span>
        </h1>
        
        <p className="max-w-[600px] text-white/90 text-base sm:text-lg md:text-xl mb-6 sm:mb-10 leading-relaxed animate-slide-up px-4" style={{ animationDelay: '200ms' }}>
          {subtitle}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-16 px-4">
          <Button
            size="lg"
            className="animate-scale-in rounded-full px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg bg-white text-black hover:bg-white/90 shadow-2xl hover:shadow-white/25 hover:scale-105 transition-all duration-300"
            style={{ animationDelay: '400ms' }}
            asChild
          >
            <a href="/quote" className="flex items-center gap-2">
              {ctaText}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
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
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-5 pointer-events-none" aria-hidden="true" />
    </section>
  );
}
