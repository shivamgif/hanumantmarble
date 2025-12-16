"use client"

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";

export function CartSummary() {
  const { cartCount, cartDetails, removeItem, formattedTotalPrice, redirectToCheckout } = useCart();

  const handleCheckout = async () => {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cart: cartDetails }),
      });

      if (!response.ok) throw new Error('Failed to create checkout session');
      const { id } = await response.json();
      await redirectToCheckout({ sessionId: id });
    } catch (error) {
      console.error('Error during checkout:', error);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs">
              {cartCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Shopping Cart</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-grow">
          {Object.values(cartDetails || {}).map((item) => (
            <div key={item.id} className="flex items-center gap-4 py-4">
              <div className="relative h-16 w-16 rounded-md overflow-hidden">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.formattedValue} x {item.quantity}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(item.id)}
              >
                &times;
              </Button>
            </div>
          ))}
        </ScrollArea>
        <SheetFooter className="mt-auto">
          <div className="w-full space-y-4">
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formattedTotalPrice}</span>
            </div>
            <Button className="w-full" onClick={handleCheckout} disabled={cartCount === 0}>
              Checkout
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
