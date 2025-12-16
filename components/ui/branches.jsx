"use client"

import { Building2, MapPin, Phone, BarChart } from "lucide-react"
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
    <section id="branches" className="py-16 bg-muted/50">
      <div className="container mx-auto px-4">
        <div ref={titleRef}>
          <h2 className={cn(
            "text-3xl font-bold text-center mb-12",
            "animate-on-scroll",
            isTitleInView ? "in-view" : ""
          )}>
            {getTranslation('branches.title', language)}
            <div className={cn(
              "h-1 w-16 bg-primary mx-auto mt-4 rounded-full",
              "scale-on-scroll",
              isTitleInView ? "in-view" : ""
            )}></div>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {branchKeys.map((key, index) => (
            <AnimatedDiv
              key={index}
              baseClasses="bg-card text-card-foreground rounded-lg shadow-lg p-6 hover-lift"
              animationClasses="fade-on-scroll in-view"
              delay={`${index * 100}ms`}
            >
              <div className="flex flex-col gap-4">
                <AnimatedDiv
                  baseClasses="flex items-center gap-2 text-primary"
                  animationClasses="in-view"
                  delay={`${index * 100 + 100}ms`}
                >
                  <Building2 className="h-5 w-5 float-on-scroll" />
                  <h3 className="font-semibold">{getTranslation(`branches.locations.${key}.name`, language)}</h3>
                </AnimatedDiv>
                <AnimatedDiv
                  baseClasses="overflow-hidden rounded-lg h-[200px]"
                  animationClasses="in-view"
                  delay={`${index * 100 + 500}ms`}
                >
                  <iframe
                    title={getTranslation(`branches.locations.${key}.name`, language)}
                    width="100%"
                    height="100%"
                    src={getMapUrl(branchLocations[key])}
                    className="rounded-lg"
                    loading="lazy"
                  />
                </AnimatedDiv>
                <AnimatedDiv
                  baseClasses="flex items-start gap-2 text-sm"
                  animationClasses="in-view"
                  delay={`${index * 100 + 200}ms`}
                >
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground float-on-scroll" />
                  <p className="text-muted-foreground">{getTranslation(`branches.locations.${key}.address`, language)}</p>
                </AnimatedDiv>
                
                <AnimatedDiv
                  baseClasses="flex items-center gap-2 text-sm"
                  animationClasses="in-view"
                  delay={`${index * 100 + 300}ms`}
                >
                  <Phone className="h-4 w-4 text-muted-foreground float-on-scroll" />
                  <p className="text-muted-foreground">+91 9696103802</p>
                </AnimatedDiv>
                
                <AnimatedDiv
                  baseClasses="flex items-center gap-2 mt-2 text-sm font-medium border-t pt-4"
                  animationClasses="in-view"
                  delay={`${index * 100 + 400}ms`}
                >
                  <BarChart className="h-4 w-4 text-primary float-on-scroll" />
                  <p className="text-foreground">{getTranslation(`branches.locations.${key}.stats`, language)}</p>
                </AnimatedDiv>
              </div>
            </AnimatedDiv>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Branches
