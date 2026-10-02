"use client"

import { FileText, IndianRupee, Shield, MessageSquare } from 'lucide-react';
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
    { icon: Shield, label: getTranslation('quote.badges.quality', language) },
    { icon: IndianRupee, label: getTranslation('quote.badges.pricing', language) },
    { icon: MessageSquare, label: getTranslation('quote.badges.consultation', language) },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background decorations */}
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
            "font-semibold tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-5xl animate-on-scroll",
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
                  "px-3 py-1.5 text-sm font-medium border-border bg-card text-foreground"
                )}
              >
                <badge.icon className="w-4 h-4 mr-2 text-primary" strokeWidth={1.75} />
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className={cn(
          "max-w-3xl mx-auto animate-on-scroll",
          isHeaderInView ? "in-view" : ""
        )} style={{ transitionDelay: "400ms" }}>
          <div className="rounded-xl border border-border bg-card p-5 sm:p-8 md:p-10 shadow-card">
            <ProductForm />
          </div>
        </div>
      </div>
    </div>
  );
}
