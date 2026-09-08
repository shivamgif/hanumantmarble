"use client";

import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

/**
 * Shared section header. `align="left"` uses the hero's accent-bar treatment,
 * `align="center"` keeps the classic underline — so consecutive sections don't
 * all read with the same rhythm.
 */
export function SectionHeading({
  eyebrow,
  icon,
  title,
  subtitle,
  align = "center",
  tone = "light",
  className,
}) {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const centered = align === "center";
  const dark = tone === "dark";

  return (
    <div
      ref={ref}
      className={cn(centered ? "text-center" : "text-left max-w-2xl", className)}
    >
      {!centered && (
        <div
          className={cn(
            "h-1 w-12 rounded-full bg-primary mb-6 scale-on-scroll",
            inView && "in-view"
          )}
        />
      )}

      {eyebrow && (
        <div
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6 animate-on-scroll",
            dark
              ? "bg-white/10 text-[#fbbf60] border border-white/15 backdrop-blur-sm"
              : "bg-primary/10 text-primary",
            inView && "in-view"
          )}
        >
          {icon}
          {eyebrow}
        </div>
      )}

      <h2
        className={cn(
          "font-display text-3xl sm:text-4xl md:text-5xl tracking-tight mb-4 animate-on-scroll",
          dark ? "text-white" : "text-foreground",
          inView && "in-view"
        )}
        style={{ transitionDelay: "100ms" }}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className={cn(
            "text-base sm:text-lg leading-relaxed animate-on-scroll",
            centered && "max-w-2xl mx-auto px-4 sm:px-0",
            dark ? "text-white/65" : "text-muted-foreground",
            inView && "in-view"
          )}
          style={{ transitionDelay: "200ms" }}
        >
          {subtitle}
        </p>
      )}

      {centered && (
        <div
          className={cn(
            "h-1 w-24 rounded-full bg-primary mx-auto mt-6 scale-on-scroll",
            inView && "in-view"
          )}
          style={{ transitionDelay: "300ms" }}
        />
      )}
    </div>
  );
}
