"use client"

import { FileText, Sparkles, Shield, MessageSquare } from 'lucide-react';
import { ProductForm } from '@/components/ui/product-form';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInView } from '@/lib/hooks/useInView';

export default function Quote() {
  const { language } = useLanguage();
  const [headerRef, isHeaderInView] = useInView({ threshold: 0.2 });

  const badges = [
    { icon: Shield, label: getTranslation('quote.badges.quality', language), color: 'from-emerald-500 to-green-500' },
    { icon: Sparkles, label: getTranslation('quote.badges.pricing', language), color: 'from-blue-500 to-cyan-500' },
    { icon: MessageSquare, label: getTranslation('quote.badges.consultation', language), color: 'from-violet-500 to-purple-500' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto py-12 sm:py-20 px-4 space-y-8 sm:space-y-12 relative z-10">
        <div ref={headerRef} className="text-center space-y-6 max-w-2xl mx-auto">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )}>
            <FileText className="w-4 h-4" />
            Request a Quote
          </div>

          <h1 className={cn(
            "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "100ms" }}>
            {getTranslation('quote.title', language)}
          </h1>

          <p className={cn(
            "text-xl text-muted-foreground leading-relaxed animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "200ms" }}>
            {getTranslation('quote.subtitle', language)}
          </p>

          <div className={cn(
            "flex flex-wrap items-center justify-center gap-3 animate-on-scroll",
            isHeaderInView ? "in-view" : ""
          )} style={{ transitionDelay: "300ms" }}>
            {badges.map((badge, index) => (
              <Badge 
                key={index}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-0 text-white bg-gradient-to-r",
                  badge.color
                )}
              >
                <badge.icon className="w-4 h-4 mr-2" />
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className={cn(
          "max-w-3xl mx-auto animate-on-scroll",
          isHeaderInView ? "in-view" : ""
        )} style={{ transitionDelay: "400ms" }}>
          <div className="rounded-2xl border-0 bg-card/80 backdrop-blur-sm p-5 sm:p-8 md:p-10 shadow-2xl">
            <ProductForm />
          </div>
        </div>
      </div>
    </div>
  );
}
