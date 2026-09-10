"use client"

import Image from "next/image"
import { MapPin, Phone, Navigation, MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnimateOnScroll } from "@/lib/hooks/useAnimateOnScroll"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"
import { SectionHeading } from "./section-heading"

const PHONE = "+919696103802"

const branches = [
  { key: "ringRoad", lat: 26.8467, lng: 80.9462, image: "/gallery1.jpeg" },
  { key: "vrindavan", lat: 26.8601, lng: 80.9465, image: "/gallery4.jpeg" },
  { key: "sultanpur", lat: 26.8220, lng: 80.9716, image: "/gallery5.jpeg" },
  { key: "buddheshwar", lat: 26.8741, lng: 80.9451, image: "/gallery6.jpeg" },
]

export function Branches() {
  const { language } = useLanguage()
  const { ref: gridRef, inView } = useAnimateOnScroll({ threshold: 0.1, triggerOnce: true })

  return (
    <section id="branches" className="relative py-16 sm:py-24 bg-muted/25 overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <SectionHeading
          align="left"
          className="mb-12"
          eyebrow="Visit Us"
          icon={<MapPinned className="w-4 h-4" />}
          title={getTranslation('branches.title', language)}
          subtitle="Four showrooms across Lucknow. Walk in to see the finish and feel the material before you decide."
        />

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {branches.map((branch, index) => {
            const name = getTranslation(`branches.locations.${branch.key}.name`, language)
            // ponytail: a static Google Maps directions link beats four embedded
            // map iframes — same job, no third-party frames on first paint.
            const directions = `https://www.google.com/maps/dir/?api=1&destination=${branch.lat},${branch.lng}`

            return (
              <div
                key={branch.key}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl bg-card border border-border/60 hover:border-primary/40 hover:shadow-lg transition-all duration-300 animate-on-scroll",
                  inView && "in-view"
                )}
                style={{ transitionDelay: `${Math.min(index, 3) * 70}ms` }}
              >
                <div className="relative h-44 overflow-hidden">
                  <Image
                    src={branch.image}
                    alt={name}
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <h3 className="absolute bottom-4 left-4 right-4 font-display text-xl text-white leading-tight">
                    {name}
                  </h3>
                </div>

                <div className="flex flex-col gap-4 p-5 flex-1">
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <p className="text-muted-foreground leading-relaxed">
                      {getTranslation(`branches.locations.${branch.key}.address`, language)}
                    </p>
                  </div>

                  <a
                    href={`tel:${PHONE}`}
                    className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    +91 96961 03802
                  </a>

                  <p className="text-sm font-medium text-foreground mt-auto pt-4 border-t border-border/60">
                    {getTranslation(`branches.locations.${branch.key}.stats`, language)}
                  </p>

                  <a
                    href={directions}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-border py-2.5 text-sm font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300"
                  >
                    <Navigation className="h-4 w-4" />
                    Get Directions
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Branches
