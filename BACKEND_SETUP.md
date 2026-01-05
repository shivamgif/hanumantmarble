# Backend Setup Guide

## Order Management & Payment Integration

### Environment Variables Required

Add these to your `.env.local` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Auth0 Configuration
AUTH0_SECRET=your-32-byte-hex-secret
AUTH0_DOMAIN=your-tenant.region.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
APP_BASE_URL=http://localhost:3000

# Client-side Auth0
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.region.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id

# Application URLs
NEXT_PUBLIC_URL=http://localhost:3000
```

### Stripe Webhook Setup (Local Development)

1. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Copy the webhook signing secret (starts with `whsec_`) and add to `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Auth0 Callback URLs

Add these to your Auth0 Application Settings:

**Allowed Callback URLs:**
- `http://localhost:3000/auth/callback`
- `https://your-production-domain.com/auth/callback`

**Allowed Logout URLs:**
- `http://localhost:3000`
- `https://your-production-domain.com`

**Allowed Web Origins:**
- `http://localhost:3000`
- `https://your-production-domain.com`

## API Routes

### Orders API

#### `GET /api/orders`
Get all orders for the authenticated user.

**Response:**
```json
{
  "orders": [
    {
      "id": "ORD-1000",
      "userId": "auth0|123",
      "userEmail": "user@example.com",
      "items": [...],
      "total": 1500.00,
      "status": "processing",
      "createdAt": "2025-12-17T..."
    }
  ]
}
```

#### `POST /api/orders`
Create a new order.

**Request Body:**
```json
{
  "items": [
    {
      "name": "White Marble Slab",
      "quantity": 2,
      "price": 150.00
    }
  ],
  "shippingAddress": {
    "name": "John Doe",
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001",
    "country": "India"
  },
  "total": 300.00,
  "subtotal": 254.24,
  "tax": 45.76,
  "shipping": 0
}
```

#### `GET /api/orders/[id]`
Get a specific order by ID.

#### `PATCH /api/orders/[id]`
Update order status.

**Request Body:**
```json
{
  "status": "shipped",
  "trackingNumber": "TRACK123",
  "estimatedDelivery": "2025-12-20"
}
```

### Checkout API

#### `POST /api/checkout`
Create a Stripe checkout session and order.

**Request Body:**
```json
{
  "cart": {
    "item1": {
      "name": "Product Name",
      "price": 100,
      "quantity": 2
    }
  },
  "shippingAddress": {...}
}
```

**Response:**
```json
{
  "id": "cs_test_...",
  "orderId": "ORD-1000"
}
```

### Webhooks

#### `POST /api/webhooks/stripe`
Stripe webhook handler for payment events.

**Events Handled:**
- `checkout.session.completed` - Updates order to "processing" and "paid"
- `payment_intent.succeeded` - Logs successful payment
- `payment_intent.payment_failed` - Updates order to "failed"
- `charge.refunded` - Updates order to "refunded"

## Database Schema

### Order Object
```javascript
{
  id: "ORD-1000",
  userId: "auth0|123456",
  userEmail: "user@example.com",
  userName: "John Doe",
  items: [
    {
      name: "Product Name",
      quantity: 2,
      price: 100.00
    }
  ],
  shippingAddress: {
    name: "John Doe",
    street: "123 Main St",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India"
  },
  paymentMethod: "stripe",
  subtotal: 200.00,
  tax: 36.00,
  shipping: 0,
  total: 236.00,
  status: "processing", // pending, processing, shipped, delivered, cancelled, failed, refunded
  paymentStatus: "paid", // pending, paid, failed, refunded
  trackingNumber: null,
  estimatedDelivery: null,
  stripeSessionId: "cs_test_...",
  stripePaymentIntentId: "pi_...",
  createdAt: "2025-12-17T...",
  updatedAt: "2025-12-17T..."
}
```

## Production Setup

### Database Migration

Replace the in-memory database with a real database:

1. **MongoDB with Mongoose:**
   ```bash
   npm install mongoose
   ```

2. **PostgreSQL with Prisma:**
   ```bash
   npm install prisma @prisma/client
   npx prisma init
   ```

### Stripe Webhook (Production)

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy the signing secret and add to production environment variables

### Security Checklist

- [ ] Enable HTTPS in production
- [ ] Set secure Auth0 callback URLs
- [ ] Add STRIPE_WEBHOOK_SECRET to production env
- [ ] Implement rate limiting on API routes
- [ ] Add admin role checks for order updates
- [ ] Enable CORS protection
- [ ] Add request validation middleware
- [ ] Implement logging and monitoring

## Testing

### Test Order Creation
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Cookie: appSession=..." \
  -d '{"items":[{"name":"Test Product","quantity":1,"price":100}],"shippingAddress":{},"total":100}'
```

### Test Webhook
```bash
stripe trigger checkout.session.completed
```

## Next Steps

1. Implement proper database (MongoDB/PostgreSQL)
2. Add email notifications for order status changes
3. Build admin dashboard for order management
4. Add order tracking page with real-time updates
5. Implement refund processing
6. Add order history export (CSV/PDF)
7. Set up automated backup for order data
