"use client"

import { ShoppingCart, Trash2, ShoppingBag } from "lucide-react";
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
        <Button variant="outline" size="icon" className="relative rounded-full hover:scale-105 transition-transform">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-medium shadow-lg">
              {cartCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col bg-card">
        <SheetHeader className="border-b border-border/50 pb-4">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="h-5 w-5" />
            Shopping Cart
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-grow py-4">
          {Object.values(cartDetails || {}).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            Object.values(cartDetails || {}).map((item) => (
              <div key={item.id} className="group flex items-center gap-4 py-4 px-2 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="relative h-16 w-16 rounded-xl overflow-hidden shadow-md">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.formattedValue} × {item.quantity}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </ScrollArea>
        <SheetFooter className="mt-auto border-t border-border/50 pt-4">
          <div className="w-full space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{formattedTotalPrice}</span>
            </div>
            <Button 
              className="w-full h-12 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 transition-opacity text-lg font-medium" 
              onClick={handleCheckout} 
              disabled={cartCount === 0}
            >
              Checkout
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
