"use client";

import { useUser, withPageAuthRequired } from '@auth0/nextjs-auth0/client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

function OrdersPage() {
  const { user, isLoading } = useUser();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

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
              date: new Date(order.createdAt).toLocaleDateString(),
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

  if (isLoading || loadingOrders) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="loading-state">
          <p className="loading-text">Loading your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-primary mb-8">My Orders</h1>
      
      {orders.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-lg shadow-lg">
          <p className="text-muted-foreground text-lg mb-4">You haven't placed any orders yet.</p>
          <Link href="/" className="button login">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => (
            <div key={order.id} className="bg-card p-6 rounded-lg shadow-md hover-lift transition-transform duration-300">
              <div className="flex flex-wrap justify-between items-center mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Order ID</p>
                  <p className="font-mono text-primary">{order.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-primary">{order.date}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-bold text-lg text-primary">{order.total}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    order.status === 'Delivered' ? 'bg-green-100 text-green-800' : 
                    order.status === 'Shipped' ? 'bg-blue-100 text-blue-800' : 
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="text-md font-semibold text-primary mb-2">Items</h3>
                <ul className="list-disc list-inside text-muted-foreground">
                  {order.items.map((item, index) => (
                    <li key={index}>{item.name} (x{item.quantity})</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default withPageAuthRequired(OrdersPage, {
  onRedirecting: () => (
    <div className="flex justify-center items-center h-screen">
      <div className="loading-state">
        <p className="loading-text">Redirecting to login...</p>
      </div>
    </div>
  ),
  onError: error => <p>{error.message}</p>
});
