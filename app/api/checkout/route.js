import Stripe from 'stripe';
import { auth0 } from '@/lib/auth0';
import { ordersDB } from '@/lib/db/orders';

export async function POST(request) {
  try {
    const { cart, shippingAddress } = await request.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Get user session
    const session = await auth0.getSession(request);

    const line_items = Object.values(cart || {}).map((item) => ({
      price_data: {
        currency: 'inr',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        // Expecting item.price in major units (e.g., INR). Convert to paise.
        unit_amount: Math.round(Number(item.price) * 100) || 0,
      },
      quantity: item.quantity || 1,
    })).filter(li => li.price_data.unit_amount > 0);

    if (!line_items.length) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), { status: 400 });
    }

    // Calculate totals
    const subtotal = line_items.reduce((sum, item) => sum + (item.price_data.unit_amount * item.quantity / 100), 0);
    const tax = subtotal * 0.18; // 18% GST
    const shipping = subtotal > 5000 ? 0 : 100; // Free shipping over ₹5000
    const total = subtotal + tax + shipping;

    // Create order in database before checkout
    let order = null;
    if (session) {
      order = await ordersDB.create({
        userId: session.user.sub,
        userEmail: session.user.email,
        userName: session.user.name,
        items: Object.values(cart).map(item => ({
          name: item.name,
          quantity: item.quantity || 1,
          price: item.price,
        })),
        shippingAddress: shippingAddress || { pending: true },
        paymentMethod: 'stripe',
        subtotal,
        tax,
        shipping,
        total,
        status: 'pending',
        paymentStatus: 'pending',
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order?.id || ''}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/?success=false`,
      metadata: {
        orderId: order?.id || '',
      },
    });

    return new Response(JSON.stringify({ id: checkoutSession.id, orderId: order?.id }), { status: 200 });
  } catch (err) {
    console.error('Checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
