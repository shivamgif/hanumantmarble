"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { SectionHeading } from "./section-heading";

// Asymmetric mosaic — deliberately uneven so this band doesn't read as
// another equal-card grid like the sections below it.
const shots = [
  { src: "/gallery1.jpeg", span: "md:col-span-7", height: "h-[280px] md:h-[420px]" },
  { src: "/gallery2.jpeg", span: "md:col-span-5", height: "h-[280px] md:h-[420px]" },
  { src: "/gallery3.jpeg", span: "md:col-span-4", height: "h-[240px] md:h-[300px]" },
  { src: "/gallery4.jpeg", span: "md:col-span-4", height: "h-[240px] md:h-[300px]" },
  { src: "/gallery5.jpeg", span: "md:col-span-4", height: "h-[240px] md:h-[300px]" },
];

export function WorkGallery() {
  const { language } = useLanguage();
  const [gridRef, isGridInView] = useInView({ threshold: 0.1 });

  return (
    <section id="work" className="relative bg-[#0a0a1a] py-16 sm:py-24 overflow-hidden">
      {/* Warm glow echoing the hero, so the two dark bands feel related */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "10%",
          right: -120,
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: "rgba(224,122,0,0.12)",
          filter: "blur(120px)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <SectionHeading
            align="left"
            tone="dark"
            eyebrow={language === "hi" ? "हमारा काम" : "Our Work"}
            icon={<Camera className="w-4 h-4" />}
            title={
              language === "hi" ? (
                <>असली घर, <em className="italic text-[#fbbf60]">असली फ़िनिश</em></>
              ) : (
                <>Real homes, <em className="italic text-[#fbbf60]">real finishes</em></>
              )
            }
            subtitle={
              language === "hi"
                ? "लखनऊ भर के हमारे शोरूम और प्रोजेक्ट्स की झलक।"
                : "A look inside our showrooms and the spaces we have helped build across Lucknow."
            }
          />

          <Link
            href="/about#gallery"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-[#fbbf60] transition-colors whitespace-nowrap"
          >
            {language === "hi" ? "पूरी गैलरी देखें" : "See full gallery"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {shots.map((shot, index) => (
            <div
              key={shot.src}
              className={cn(
                "group relative overflow-hidden rounded-2xl fade-on-scroll",
                shot.span,
                shot.height,
                isGridInView && "in-view"
              )}
              style={{ transitionDelay: `${Math.min(index, 3) * 70}ms` }}
            >
              <Image
                src={shot.src}
                alt={`Hanumant Marble project ${index + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-70 group-hover:opacity-40 transition-opacity duration-500" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
