"use client"

import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <CheckCircle className="h-24 w-24 text-green-500 mx-auto mb-8" />
      <h1 className="text-4xl font-bold tracking-tight lg:text-5xl mb-4">
        Payment Successful!
      </h1>
      <p className="text-xl text-muted-foreground mb-8">
        Thank you for your purchase. Your order is being processed.
      </p>
      <Button asChild>
        <Link href="/">Continue Shopping</Link>
      </Button>
    </div>
  );
}
