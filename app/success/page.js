"use client"

import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { CheckCircle, ArrowRight, ShoppingBag } from "lucide-react";
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
      <div ref={contentRef} className="container mx-auto px-4 py-12 sm:py-20 text-center relative z-10">
        {/* Success Icon */}
        <div className={cn(
          "relative inline-block mb-8 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )}>
          <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-600/20 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          </div>
        </div>

        {/* Badge */}
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-6 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "80ms" }}>
          Order Confirmed
        </div>

        {/* Heading */}
        <h1 className={cn(
          "font-semibold tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-5xl mb-4 animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "160ms" }}>
          Payment Successful!
        </h1>

        {/* Description */}
        <p className={cn(
          "text-base sm:text-lg md:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-lg mx-auto animate-on-scroll px-4",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "240ms" }}>
          Thank you for your purchase. Your order is being processed and you'll receive a confirmation email shortly.
        </p>

        {/* CTA Button */}
        <div className={cn(
          "flex flex-col sm:flex-row gap-4 justify-center animate-on-scroll",
          isContentInView ? "in-view" : ""
        )} style={{ transitionDelay: "320ms" }}>
          <Button asChild size="lg" className="px-6">
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
