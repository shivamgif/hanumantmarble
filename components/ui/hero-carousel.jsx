"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeroCarousel({
  images = ["/hero1.png", "/hero2.jpeg", "/hero3.jpeg"],
  title = "FOR YOUR SWEET HOME",
  subtitle = "One of the biggest collection of tiles and sanitaryware in Lucknow. Build your dream home with us.",
  ctaText = "Get Quote",
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex + 1 === images.length ? 0 : prevIndex + 1
    );
  };

  const handlePrevious = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex - 1 < 0 ? images.length - 1 : prevIndex - 1
    );
  };

  useEffect(() => {
    const interval = setInterval(() => {
      handleNext();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative bg-background text-foreground overflow-hidden">
      {/* Image Carousel */}
      <div className="relative h-[70vh] w-full overflow-hidden">
        {images.map((image, index) => (
          <div
            key={index}
            className={cn(
              "absolute inset-0 h-full w-full transition-all duration-1000",
              index === currentIndex ? "opacity-100 scale-100" : "opacity-0 scale-105"
            )}
          >
            <img
              src={image}
              alt={`Hero image ${index + 1}`}
              className="object-cover w-full h-full"
            />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        ))}

        {/* Carousel Controls */}
        <div className="absolute bottom-8 right-8 flex gap-2 z-20">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-background/20 backdrop-blur-sm border-border/10 hover:bg-background/30 hover-scale"
            onClick={handlePrevious}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-background/20 backdrop-blur-sm border-border/10 hover:bg-background/30 hover-scale"
            onClick={handleNext}
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
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 animate-slide-up opacity-100">
            {title}
          </h1>
          <p className="max-w-[600px] text-white/90 text-lg md:text-xl mb-8 animate-slide-up opacity-100" style={{ animationDelay: '200ms' }}>
            {subtitle}
          </p>
          <Button 
            size="lg"
            className="animate-scale-in opacity-100 hover-scale shimmer" 
            style={{ animationDelay: '400ms' }}
          >
            <a href="/quote" className="flex items-center">
              {ctaText} <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
