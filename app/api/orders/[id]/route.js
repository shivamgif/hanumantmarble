import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-server';
import { ordersDB } from '@/lib/db/orders';
import { isAdmin } from '@/lib/admin-config';

// GET /api/orders/[id] - Get a specific order
export async function GET(request, { params }) {
  try {
    const session = await auth.getSession(request);
    
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
    if (order.userEmail !== session.user.email && !isAdmin(session.user.email)) {
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
    const session = await auth.getSession(request);
    
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

    // Customers may only cancel their own order — nothing else.
    if (order.userEmail === session.user.email && !isAdmin(session.user.email)) {
      if (status !== 'cancelled') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const updatedOrder = await ordersDB.update(id, { status, paymentStatus: 'refunded' });
      return NextResponse.json({ order: updatedOrder });
    }

    // Every other field (tracking, payment status, arbitrary status) is admin-only.
    if (!isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
