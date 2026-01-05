import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { ordersDB } from '@/lib/db/orders';

// GET /api/orders - Get all orders for the authenticated user
export async function GET(request) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;
    const orders = await ordersDB.getByUserEmail(userEmail);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

// POST /api/orders - Create a new order
export async function POST(request) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items, shippingAddress, paymentMethod, total, subtotal, tax, shipping } = body;

    // Validate required fields
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must contain at least one item' },
        { status: 400 }
      );
    }

    if (!shippingAddress) {
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      );
    }

    // Create order
    const order = await ordersDB.create({
      userId: session.user.sub,
      userEmail: session.user.email,
      userName: session.user.name,
      items,
      shippingAddress,
      paymentMethod: paymentMethod || 'pending',
      total,
      subtotal,
      tax,
      shipping,
      status: 'pending',
      paymentStatus: 'pending',
      trackingNumber: null,
      estimatedDelivery: null,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
