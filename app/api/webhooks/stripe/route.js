import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { ordersDB } from '@/lib/db/orders';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    let event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;

        if (orderId) {
          // Update order status to processing
          await ordersDB.update(orderId, {
            status: 'processing',
            paymentStatus: 'paid',
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
          });

          console.log(`Order ${orderId} payment confirmed`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log(`PaymentIntent ${paymentIntent.id} succeeded`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.log(`PaymentIntent ${paymentIntent.id} failed`);
        
        // Find and update order status
        const orders = await ordersDB.getAll();
        const order = orders.find(o => o.stripePaymentIntentId === paymentIntent.id);
        if (order) {
          await ordersDB.update(order.id, {
            status: 'failed',
            paymentStatus: 'failed',
          });
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(`Charge ${charge.id} refunded`);
        
        // Find and update order status
        const orders = await ordersDB.getAll();
        const order = orders.find(o => o.stripePaymentIntentId === charge.payment_intent);
        if (order) {
          await ordersDB.update(order.id, {
            status: 'refunded',
            paymentStatus: 'refunded',
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
