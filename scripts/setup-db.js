#!/usr/bin/env node

/**
 * Database Setup Script for Neon
 * 
 * This script:
 * 1. Creates the products table
 * 2. Imports existing products from data/products.json
 * 
 * Run with: node scripts/setup-db.js
 * Required: DATABASE_URL environment variable
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.log('\nAdd it to your .env.local file:');
  console.log('DATABASE_URL=your_neon_connection_string\n');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // Create table
    console.log('📋 Creating products table...');
    await sql`
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
      )
    `;
    console.log('✅ Table created\n');

    // Create indexes
    console.log('📇 Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`;
    console.log('✅ Indexes created\n');

    // Import products
    console.log('📦 Importing products from data/products.json...');
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

    for (const product of productsData) {
      await sql`
        INSERT INTO products (
          id, slug, name, name_hi, category, category_hi,
          description, description_hi, price, rating, reviews,
          in_stock, features, features_hi, specifications,
          variants, main_image
        ) VALUES (
          ${product.id},
          ${product.slug},
          ${product.name},
          ${product.nameHi},
          ${product.category},
          ${product.categoryHi},
          ${product.description},
          ${product.descriptionHi},
          ${product.price},
          ${product.rating},
          ${product.reviews},
          ${product.inStock},
          ${JSON.stringify(product.features)}::jsonb,
          ${JSON.stringify(product.featuresHi)}::jsonb,
          ${JSON.stringify(product.specifications)}::jsonb,
          ${JSON.stringify(product.variants)}::jsonb,
          ${product.mainImage}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          updated_at = NOW()
      `;
      console.log(`  ✓ Imported: ${product.name}`);
    }

    console.log(`\n✅ Successfully imported ${productsData.length} products`);
    console.log('\n🎉 Database setup complete!');
    console.log('\nYou can now:');
    console.log('  • Visit /admin to manage products');
    console.log('  • Products will be fetched from Neon database');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();
