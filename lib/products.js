// Product data with variants based on actual product images
// In production, this is updated via the admin panel through data/products.json

import productsData from "@/data/products.json";

export const products = productsData;

export function getProductBySlug(slug) {
  return products.find(p => p.slug === slug);
}

export function getProductById(id) {
  return products.find(p => p.id === id);
}

export function getAllProducts() {
  return products;
}

export function getProductsByCategory(category) {
  return products.filter(p => p.category.toLowerCase() === category.toLowerCase());
}
