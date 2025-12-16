"use client"

import { Building2, MapPin, Phone, BarChart, MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnimateOnScroll } from "@/lib/hooks/useAnimateOnScroll"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"

const branchKeys = ["ringRoad", "vrindavan", "sultanpur", "buddheshwar"]

const branchLocations = {
  ringRoad: { lat: 26.8467, lng: 80.9462 },
  vrindavan: { lat: 26.8601, lng: 80.9465 },
  sultanpur: { lat: 26.8220, lng: 80.9716 },
  buddheshwar: { lat: 26.8741, lng: 80.9451 }
}

const branchColors = [
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-purple-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-green-500"
]

function AnimatedDiv({ baseClasses, animationClasses, delay, children }) {
  const { ref, inView } = useAnimateOnScroll({ threshold: 0.1, triggerOnce: true });
  return (
    <div
      ref={ref}
      className={cn(baseClasses, "animate-on-scroll", inView && animationClasses)}
      style={{ transitionDelay: inView ? delay : "0ms" }}
    >
      {children}
    </div>
  );
}

export function Branches() {
  const { language } = useLanguage();
  const { ref: titleRef, inView: isTitleInView } = useAnimateOnScroll({ threshold: 0.2, triggerOnce: true });

  const getMapUrl = (location) => {
    return `https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.002},${location.lat - 0.002},${location.lng + 0.002},${location.lat + 0.002}&layer=mapnik&marker=${location.lat},${location.lng}`
  }

  return (
    <section id="branches" className="relative py-12 sm:py-20 bg-gradient-to-b from-background via-muted/30 to-background overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-16">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            <MapPinned className="w-4 h-4" />
            Visit Us
          </div>
          <h2 className={cn(
            "text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('branches.title', language)}
          </h2>
          <p className={cn(
            "text-muted-foreground text-lg max-w-2xl mx-auto animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            Find our showrooms across Lucknow for the best in-person experience
          </p>
          <div className={cn(
            "h-1 w-24 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-6 rounded-full scale-on-scroll",
            isTitleInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {branchKeys.map((key, index) => (
            <AnimatedDiv
              key={index}
              baseClasses="group bg-card/80 backdrop-blur-sm text-card-foreground rounded-2xl shadow-lg hover:shadow-2xl p-6 transition-all duration-500 hover:-translate-y-2 border-0"
              animationClasses="fade-on-scroll in-view"
              delay={`${index * 100}ms`}
            >
              <div className="flex flex-col gap-4">
                {/* Branch Header */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br transition-transform duration-300 group-hover:scale-110",
                    branchColors[index]
                  )}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{getTranslation(`branches.locations.${key}.name`, language)}</h3>
                </div>

                {/* Map */}
                <AnimatedDiv
                  baseClasses="overflow-hidden rounded-xl h-[180px] shadow-inner"
                  animationClasses="in-view"
                  delay={`${index * 100 + 200}ms`}
                >
                  <iframe
                    title={getTranslation(`branches.locations.${key}.name`, language)}
                    width="100%"
                    height="100%"
                    src={getMapUrl(branchLocations[key])}
                    className="rounded-xl"
                    loading="lazy"
                  />
                </AnimatedDiv>

                {/* Address */}
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                  <p className="text-muted-foreground leading-relaxed">{getTranslation(`branches.locations.${key}.address`, language)}</p>
                </div>
                
                {/* Phone */}
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-muted-foreground">+91 9696103802</p>
                </div>
                
                {/* Stats */}
                <div className={cn(
                  "flex items-center gap-3 mt-2 text-sm font-medium border-t border-border/50 pt-4"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br",
                    branchColors[index]
                  )}>
                    <BarChart className="h-4 w-4" />
                  </div>
                  <p className="text-foreground">{getTranslation(`branches.locations.${key}.stats`, language)}</p>
                </div>
              </div>
            </AnimatedDiv>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Branches
