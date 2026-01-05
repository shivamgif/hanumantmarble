"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingBag, Package, Truck, CheckCircle2, Clock, ArrowRight, Sparkles, ChevronRight, Calendar, CreditCard, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function OrdersPage() {
  const { user, isLoading } = useUser();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (user) {
        setLoadingOrders(true);
        try {
          const response = await fetch('/api/orders');
          if (response.ok) {
            const data = await response.json();
            // Format orders for display
            const formattedOrders = data.orders.map(order => ({
              id: order.id,
              date: new Date(order.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }),
              total: `$${order.total.toFixed(2)}`,
              status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
              items: order.items,
            }));
            setOrders(formattedOrders);
          } else {
            console.error('Failed to fetch orders');
          }
        } catch (error) {
          console.error('Error fetching orders:', error);
        } finally {
          setLoadingOrders(false);
        }
      }
    };

    fetchOrders();
  }, [user]);

  const getStatusConfig = (status) => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return { 
          icon: CheckCircle2, 
          color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
          iconColor: 'text-green-500',
          gradient: 'from-green-500 to-emerald-500'
        };
      case 'shipped':
        return { 
          icon: Truck, 
          color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          iconColor: 'text-blue-500',
          gradient: 'from-blue-500 to-cyan-500'
        };
      case 'processing':
        return { 
          icon: Package, 
          color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
          iconColor: 'text-orange-500',
          gradient: 'from-orange-500 to-amber-500'
        };
      default:
        return { 
          icon: Clock, 
          color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
          iconColor: 'text-yellow-500',
          gradient: 'from-yellow-500 to-orange-500'
        };
    }
  };

  if (isLoading || loadingOrders) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium text-muted-foreground">Loading your orders...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md text-primary border-primary/20 hover:bg-primary/20 transition-all"
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            Order History
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">My Orders</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {orders.length > 0 
              ? `You have ${orders.length} order${orders.length !== 1 ? 's' : ''} in your history`
              : 'Track and manage all your orders in one place'
            }
          </p>
        </div>

        {orders.length === 0 ? (
          /* Empty State */
          <Card className="max-w-md mx-auto bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
            <CardContent className="p-12 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
              <div className="relative">
                <div className="relative mx-auto w-24 h-24 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/50 rounded-full blur-lg opacity-30" />
                  <div className="relative h-full w-full rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <ShoppingBag className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
                <p className="text-muted-foreground mb-6">Start shopping to see your orders here!</p>
                <Button className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all duration-300" asChild>
                  <Link href="/#products" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Start Shopping
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Orders List */
          <div className="max-w-4xl mx-auto space-y-4">
            {orders.map((order, index) => {
              const statusConfig = getStatusConfig(order.status);
              const StatusIcon = statusConfig.icon;
              const isExpanded = expandedOrder === order.id;

              return (
                <Card 
                  key={order.id} 
                  className={cn(
                    "bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer",
                  )}
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <CardContent className="p-0">
                    {/* Order Header */}
                    <div className="p-6 relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-primary/5 pointer-events-none" />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
                        {/* Order Info */}
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg shrink-0",
                            statusConfig.gradient
                          )}>
                            <StatusIcon className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground mb-0.5">Order ID</p>
                            <p className="font-mono font-semibold text-sm sm:text-base">{order.id.slice(0, 16)}...</p>
                          </div>
                        </div>

                        {/* Order Meta */}
                        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                          <div className="text-left sm:text-right">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Date
                            </p>
                            <p className="font-medium text-sm">{order.date}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              Total
                            </p>
                            <p className="font-bold text-lg">{order.total}</p>
                          </div>
                          <Badge className={cn("h-fit", statusConfig.color)}>
                            <StatusIcon className={cn("h-3 w-3 mr-1", statusConfig.iconColor)} />
                            {order.status}
                          </Badge>
                          <ChevronRight className={cn(
                            "h-5 w-5 text-muted-foreground transition-transform duration-300 hidden sm:block",
                            isExpanded && "rotate-90"
                          )} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <div className={cn(
                      "overflow-hidden transition-all duration-300",
                      isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    )}>
                      <div className="px-6 pb-6 pt-2 border-t border-border/50">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Order Items ({order.items.length})
                        </h4>
                        <div className="space-y-2">
                          {order.items.map((item, itemIndex) => (
                            <div 
                              key={itemIndex} 
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-muted to-muted-foreground/10 flex items-center justify-center">
                                  <Package className="h-5 w-5 text-muted-foreground/50" />
                                </div>
                                <span className="font-medium">{item.name}</span>
                              </div>
                              <Badge variant="secondary">x{item.quantity}</Badge>
                            </div>
                          ))}
                        </div>
                        
                        {/* Order Actions */}
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                          <Button variant="outline" size="sm" className="rounded-full">
                            <MapPin className="h-4 w-4 mr-2" />
                            Track Order
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-full">
                            View Details
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Continue Shopping CTA */}
        {orders.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" className="rounded-full px-8" asChild>
              <Link href="/" className="flex items-center gap-2">
                Continue Shopping
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withPageAuthRequired(OrdersPage, {
  onRedirecting: () => (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex justify-center items-center">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-card/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
