"use client";

import React, { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button } from "@/components/ui/button"
import { ArrowRight, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

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

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') scrollPrev()
      if (e.key === 'ArrowRight') scrollNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [scrollPrev, scrollNext])

  return (
    <section
      className="relative overflow-hidden bg-[#0a0a1a]"
      style={{ height: '88vh', minHeight: 600 }}
      aria-label="Hero carousel"
    >
      {/* Slides */}
      <div className="overflow-hidden absolute inset-0" ref={emblaRef}>
        <div className="flex h-full">
          {images.map((image, index) => (
            <div className="relative h-full w-full flex-shrink-0 min-w-0" key={index}>
              <Image
                src={image}
                alt={`Hanumant Marble showroom image ${index + 1}`}
                fill
                className="object-cover brightness-[0.72] saturate-110"
                priority={index === 0}
                sizes="100vw"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Left-side directional gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, rgba(5,5,20,0.75) 0%, rgba(5,5,20,0.45) 50%, rgba(5,5,20,0.15) 100%), linear-gradient(to top, rgba(224,122,0,0.18) 0%, transparent 40%)',
          zIndex: 2,
        }}
        aria-hidden="true"
      />

      {/* Warm orange left-side glow orb */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '30%', left: -80, width: 400, height: 400,
          borderRadius: '50%', background: 'rgba(224,122,0,0.14)',
          filter: 'blur(100px)', zIndex: 3,
        }}
        aria-hidden="true"
      />

      {/* Editorial content — left aligned */}
      <div
        className="absolute inset-0 flex flex-col justify-center"
        style={{ padding: '0 6vw', maxWidth: 760, zIndex: 10 }}
      >
        {/* Eyebrow badge */}
        <div
          className="inline-flex items-center self-start mb-6"
          style={{
            gap: 8, padding: '6px 14px', borderRadius: 9999,
            background: 'rgba(224,122,0,0.22)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(224,122,0,0.4)', color: '#fbbf60',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Premium Collection · Lucknow
        </div>

        {/* Orange accent bar */}
        <div style={{ width: 48, height: 4, background: '#e07a00', borderRadius: 9999, marginBottom: 20 }} />

        {/* Headline — DM Serif Display */}
        <h1
          className="font-display text-white animate-slide-up"
          style={{
            fontSize: 'clamp(2.4rem, 4.4vw, 4rem)',
            fontWeight: 400,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            marginBottom: 36,
          }}
        >
          For Your<br />
          <em style={{ fontStyle: 'italic', color: '#fbbf60' }}>Sweet Home</em>
        </h1>

        {/* Subtitle */}
        <p
          className="animate-slide-up"
          style={{
            fontSize: 'clamp(1rem, 1.4vw, 1.15rem)',
            color: 'rgba(255,255,255,0.75)',
            maxWidth: 480,
            lineHeight: 1.7,
            marginBottom: 40,
            fontWeight: 400,
            animationDelay: '200ms',
          }}
        >
          {subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-4 items-center animate-scale-in" style={{ animationDelay: '400ms' }}>
          <Button
            size="lg"
            className="rounded-full h-[52px] px-8 text-base font-bold hover:scale-105 transition-all duration-300"
            style={{
              background: '#e07a00',
              color: '#fff',
              boxShadow: '0 8px 28px rgba(224,122,0,0.4)',
              border: 'none',
            }}
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
            className="rounded-full h-[52px] px-8 text-base font-medium hover:scale-105 transition-all duration-300"
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1.5px solid rgba(255,255,255,0.3)',
              backdropFilter: 'blur(8px)',
            }}
            asChild
          >
            <a href="#products">Explore Products</a>
          </Button>
        </div>
      </div>

      {/* Slide counter — bottom left, editorial */}
      <div
        className="absolute flex items-center gap-2 z-20"
        style={{
          bottom: 36, left: '6vw',
          color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em',
        }}
        aria-hidden="true"
      >
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
          {String(selectedIndex + 1).padStart(2, '0')}
        </span>
        <span style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.3)', display: 'inline-block' }} />
        <span>{String(images.length).padStart(2, '0')}</span>
      </div>

      {/* Carousel Controls */}
      <div className="absolute bottom-7 right-8 flex gap-2 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-[42px] w-[42px] transition-all duration-300 text-white"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
          onClick={scrollPrev}
          aria-label="Previous slide"
        >
          <ArrowLeft className="h-[17px] w-[17px]" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-[42px] w-[42px] transition-all duration-300 text-white"
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
          onClick={scrollNext}
          aria-label="Next slide"
        >
          <ArrowRight className="h-[17px] w-[17px]" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex gap-1.5 z-20" role="tablist" aria-label="Slide indicators">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === selectedIndex}
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => scrollTo(index)}
            className={cn(
              "rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white/60",
              index === selectedIndex ? "w-7 h-[3px] bg-[#e07a00]" : "w-2 h-[3px] bg-white/30 hover:bg-white/60"
            )}
          />
        ))}
      </div>

      {/* Bottom fade into the next section's warm cream tone */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 160, background: 'linear-gradient(to top, #f5f0eb, transparent)', zIndex: 5 }}
        aria-hidden="true"
      />
    </section>
  );
}
