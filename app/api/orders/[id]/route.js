import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { ordersDB } from '@/lib/db/orders';

// GET /api/orders/[id] - Get a specific order
export async function GET(request, { params }) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const order = await ordersDB.getById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Ensure user can only access their own orders
    if (order.userEmail !== session.user.email) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

// PATCH /api/orders/[id] - Update order status (admin only for now)
export async function PATCH(request, { params }) {
  try {
    const session = await auth0.getSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { status, trackingNumber, estimatedDelivery, paymentStatus } = body;

    const order = await ordersDB.getById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // For now, allow users to cancel their own orders
    if (status === 'cancelled' && order.userEmail === session.user.email) {
      const updatedOrder = await ordersDB.update(id, { status, paymentStatus: 'refunded' });
      return NextResponse.json({ order: updatedOrder });
    }

    // Other updates would require admin permissions
    // TODO: Implement admin role check

    const updates = {};
    if (status) updates.status = status;
    if (trackingNumber) updates.trackingNumber = trackingNumber;
    if (estimatedDelivery) updates.estimatedDelivery = estimatedDelivery;
    if (paymentStatus) updates.paymentStatus = paymentStatus;

    const updatedOrder = await ordersDB.update(id, updates);

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
