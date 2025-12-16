"use client"

import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { CheckCircle, ArrowRight, ShoppingBag, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

export default function SuccessPage() {
  const { clearCart } = useCart();
  const [contentRef, isContentInView] = useInView({ threshold: 0.2 });

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="relative min-h-[80vh] overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-green-500/10 rounded-full blur-3xl" />
      </div>

      <div ref={contentRef} className="container mx-auto px-4 py-12 sm:py-20 text-center relative z-10">
        {/* Success Icon */}
        <div className={cn(
          "relative inline-block mb-8 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )}>
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full blur-2xl opacity-30 animate-pulse" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-2xl">
            <CheckCircle className="h-14 w-14 text-white" />
          </div>
        </div>

        {/* Badge */}
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-6 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "100ms" }}>
          <Sparkles className="w-4 h-4" />
          Order Confirmed
        </div>

        {/* Heading */}
        <h1 className={cn(
          "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "200ms" }}>
          Payment Successful!
        </h1>

        {/* Description */}
        <p className={cn(
          "text-base sm:text-lg md:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-lg mx-auto animate-on-scroll px-4",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "300ms" }}>
          Thank you for your purchase. Your order is being processed and you'll receive a confirmation email shortly.
        </p>

        {/* CTA Button */}
        <div className={cn(
          "flex flex-col sm:flex-row gap-4 justify-center animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "400ms" }}>
          <Button asChild size="lg" className="rounded-full px-8 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 border-0">
            <Link href="/" className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Continue Shopping
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
