# Neon Database Setup for Netlify

This guide will help you set up the Neon PostgreSQL database for your application.

## 🚀 Setup Steps

### 1. Enable Neon on Netlify

1. Go to your [Netlify dashboard](https://app.netlify.com/)
2. Select your site
3. Go to **Integrations** tab
4. Search for "Neon" and click **Enable**
5. Follow the prompts to connect your Neon account
6. Netlify will automatically add `DATABASE_URL` to your environment variables

### 2. Initialize the Database

Once `DATABASE_URL` is set in your environment:

```bash
# Run the setup script
npm run db:setup
```

This script will:
- ✅ Create the `products` table
- ✅ Create indexes for better performance
- ✅ Import all 6 products from `data/products.json`

### 3. Verify the Setup

1. Visit your admin panel at `/admin`
2. Login with your Auth0 account (must be in `ADMIN_EMAILS`)
3. You should see all products listed
4. Try editing a product to test the database connection

## 📊 Database Schema

The `products` table includes:

- **Basic Info**: id, slug, name (EN/HI), category (EN/HI)
- **Content**: description (EN/HI), price, rating, reviews
- **Status**: in_stock
- **Details**: features (EN/HI), specifications, variants (all JSONB)
- **Media**: main_image
- **Timestamps**: created_at, updated_at

## 🔧 Local Development

For local development with database:

1. Create `.env.local` (copy from `.env.local.example`)
2. Get your Neon connection string from:
   - Netlify: Site Settings → Environment Variables
   - Or Neon Console: [console.neon.tech](https://console.neon.tech)
3. Add to `.env.local`:
   ```
   DATABASE_URL=postgres://user:password@host.neon.tech/database?sslmode=require
   ```
4. Run setup: `npm run db:setup`

## 🎯 Fallback Mechanism

The app automatically falls back to `data/products.json` when:
- `DATABASE_URL` is not configured
- Database connection fails
- Good for local development without database

## 🔐 Admin Access

Only emails listed in `lib/admin-config.js` can:
- Access `/admin` panel
- Create/edit/delete products
- See the admin button in navigation

Current admin: `ssshivam.singh.2@gmail.com`

## 📝 Manual Database Operations

If you need to run custom SQL:

```javascript
import { sql } from './lib/db.js';

// Get all products
const products = await sql`SELECT * FROM products`;

// Add a new product
await sql`INSERT INTO products (...) VALUES (...)`;

// Update a product
await sql`UPDATE products SET price = ${newPrice} WHERE id = ${id}`;
```

## 🐛 Troubleshooting

### "DATABASE_URL is not defined"
- Check Netlify environment variables
- Verify `.env.local` for local development

### "Table already exists"
- Script is safe to re-run (uses `IF NOT EXISTS`)
- Products are upserted (updates on conflict)

### Products not showing in admin
- Check browser console for errors
- Verify admin email in `lib/admin-config.js`
- Ensure you're logged in with Auth0

### Database connection errors
- Check if `DATABASE_URL` is correct
- Verify Neon project is active
- App will fall back to local JSON automatically

## 🌐 Environment Variables Needed

```bash
# Neon Database (auto-added by Netlify)
DATABASE_URL=postgres://...

# Auth0 (required for admin access)
AUTH0_SECRET=...
AUTH0_BASE_URL=https://your-site.netlify.app
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...

# Stripe (for checkout)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
