-- Products table for Neon database
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  category TEXT NOT NULL,
  category_hi TEXT NOT NULL,
  description TEXT NOT NULL,
  description_hi TEXT NOT NULL,
  price INTEGER NOT NULL,
  rating DECIMAL(2,1) DEFAULT 5.0,
  reviews INTEGER DEFAULT 0,
  in_stock BOOLEAN DEFAULT true,
  features JSONB NOT NULL DEFAULT '[]',
  features_hi JSONB NOT NULL DEFAULT '[]',
  specifications JSONB NOT NULL DEFAULT '{}',
  variants JSONB NOT NULL DEFAULT '[]',
  main_image TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
