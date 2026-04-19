let sql = null;

let pool = null;

// Try to import Neon if available
try {
  const { Pool } = require('@neondatabase/serverless');

  // Next.js hot-module reloading (HMR) destroys variables on re-compile.
  // We must cache the Pool in globalThis to prevent massive SSL handshake latency on every local API hit.
  if (!globalThis._neonPool) {
    globalThis._neonPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  pool = globalThis._neonPool;

  // Backward-compatible wrapper: supports sql('SELECT ...', [params])
  // which is used throughout the stock APIs.
  sql = async (query, params = []) => {
    if (typeof query !== 'string') {
      throw new Error('Query must be a string when calling sql(query, params)');
    }

    const { rows } = await pool.query(query, params);
    return rows;
  };

  sql.query = (query, params = []) => pool.query(query, params);
} catch (e) {
  // Neon not installed yet - provide a stub that gives helpful error
  console.warn('Neon database not configured yet. Set up Neon integration in Netlify.');
  sql = async (query, params) => {
    throw new Error('Database not configured. Enable Neon in Netlify dashboard. See STOCK_DEPLOYMENT_GUIDE.md Step 2');
  };
}

export async function withTransaction(callback) {
  if (!pool) {
    throw new Error('Database pool not configured');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Provide a sql-like wrapper that uses this specific client
    const txSql = async (query, params = []) => {
      const { rows } = await client.query(query, params);
      return rows;
    };
    
    const result = await callback(txSql);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { sql };

// Helper to convert DB row to product format
export function dbRowToProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameHi: row.name_hi,
    category: row.category,
    categoryHi: row.category_hi,
    description: row.description,
    descriptionHi: row.description_hi,
    price: row.price,
    rating: parseFloat(row.rating),
    reviews: row.reviews,
    inStock: row.in_stock,
    features: row.features,
    featuresHi: row.features_hi,
    specifications: row.specifications,
    variants: row.variants,
    mainImage: row.main_image,
  };
}

// Helper to convert product format to DB columns
export function productToDbRow(product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    name_hi: product.nameHi,
    category: product.category,
    category_hi: product.categoryHi,
    description: product.description,
    description_hi: product.descriptionHi,
    price: product.price,
    rating: product.rating,
    reviews: product.reviews,
    in_stock: product.inStock,
    features: JSON.stringify(product.features),
    features_hi: JSON.stringify(product.featuresHi),
    specifications: JSON.stringify(product.specifications),
    variants: JSON.stringify(product.variants),
    main_image: product.mainImage,
  };
}
