import { neon } from '@neondatabase/serverless';

// Initialize Neon client - automatically uses DATABASE_URL from env
export const sql = neon(process.env.DATABASE_URL);

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
