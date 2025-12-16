import Stripe from 'stripe';

export async function POST(request) {
  try {
    const { cart } = await request.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/?success=false`,
    });

    return new Response(JSON.stringify({ id: session.id }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
