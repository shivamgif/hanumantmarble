"use client";

import { useState, useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { isAdmin } from '@/lib/admin-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Package, 
  Plus, 
  Save, 
  Trash2, 
  Edit, 
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Home,
  ChevronDown,
  ChevronUp,
  ImageIcon
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function AdminPage() {
  const { user, isLoading: userLoading } = useUser();
  const [products, setProducts] = useState([]);
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasChanges, setHasChanges] = useState(false);

  const userIsAdmin = user && isAdmin(user.email);

  useEffect(() => {
    if (userIsAdmin) {
      fetchProducts();
    } else {
      setLoading(false);
    }
  }, [userIsAdmin]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProducts(data.products || []);
      setSha(data.sha);
      setHasChanges(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load products: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const saveProducts = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, sha }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setMessage({ type: 'success', text: 'Products saved! Site will rebuild in ~1-2 minutes.' });
      setSha(data.sha);
      setHasChanges(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save: ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = (slug, field, value) => {
    setProducts(products.map(p => 
      p.slug === slug ? { ...p, [field]: value } : p
    ));
    setHasChanges(true);
  };

  const updateNestedField = (slug, parentField, childField, value) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return {
        ...p,
        [parentField]: {
          ...p[parentField],
          [childField]: value
        }
      };
    }));
    setHasChanges(true);
  };

  const updateArrayField = (slug, field, index, value) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      const newArray = [...p[field]];
      newArray[index] = value;
      return { ...p, [field]: newArray };
    }));
    setHasChanges(true);
  };

  const addArrayItem = (slug, field, item) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return { ...p, [field]: [...p[field], item] };
    }));
    setHasChanges(true);
  };

  const removeArrayItem = (slug, field, index) => {
    setProducts(products.map(p => {
      if (p.slug !== slug) return p;
      return { ...p, [field]: p[field].filter((_, i) => i !== index) };
    }));
    setHasChanges(true);
  };

  const deleteProduct = (slug) => {
    if (confirm('Are you sure you want to delete this product? This cannot be undone.')) {
      setProducts(products.filter(p => p.slug !== slug));
      setHasChanges(true);
      setEditingProduct(null);
    }
  };

  const addProduct = () => {
    const timestamp = Date.now();
    const newProduct = {
      id: `new-product-${timestamp}`,
      slug: `new-product-${timestamp}`,
      name: 'New Product',
      nameHi: 'नया उत्पाद',
      category: 'Uncategorized',
      categoryHi: 'अवर्गीकृत',
      description: 'Product description goes here.',
      descriptionHi: 'उत्पाद विवरण यहाँ जाएगा।',
      price: 0,
      rating: 5,
      reviews: 0,
      inStock: true,
      features: ['Feature 1'],
      featuresHi: ['विशेषता 1'],
      specifications: { 'Key': 'Value' },
      variants: [{ id: `v-${timestamp}`, name: 'Standard', image: '/products/placeholder.png' }],
      mainImage: '/products/placeholder.png'
    };
    setProducts([...products, newProduct]);
    setEditingProduct(newProduct.slug);
    setExpandedProduct(newProduct.slug);
    setHasChanges(true);
  };

  // Loading state
  if (userLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Admin Access Required</h1>
            <p className="text-muted-foreground mb-6">Please login to access the admin panel.</p>
            <Button asChild className="rounded-full">
              <a href="/api/auth/login">Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not an admin
  if (!userIsAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-red-500/5 p-4">
        <Card className="w-full max-w-md border-red-500/20">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-2">You don't have admin privileges.</p>
            <p className="text-sm text-muted-foreground mb-6">Logged in as: {user.email}</p>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Sticky Header */}
      <div className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold">Admin Panel</h1>
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  Unsaved Changes
                </Badge>
              )}
              <Button 
                onClick={saveProducts} 
                disabled={saving || !hasChanges}
                className="rounded-full"
                size="sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button asChild variant="outline" className="rounded-full" size="sm">
                <Link href="/">
                  <Home className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Site</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message.text && (
        <div className="container mx-auto px-4 pt-4">
          <div className={`flex items-center gap-2 p-4 rounded-xl ${
            message.type === 'success' 
              ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
              : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage({ type: '', text: '' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Products Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Products ({products.length})</h2>
          </div>
          <Button onClick={addProduct} className="rounded-full" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>

        {/* Products List */}
        <div className="space-y-4">
          {products.map((product) => (
            <Card key={product.slug} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Product Header - Always visible */}
                <div 
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedProduct(expandedProduct === product.slug ? null : product.slug)}
                >
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                    {product.mainImage ? (
                      <Image
                        src={product.mainImage}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{product.nameHi}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                      <span className="text-sm font-medium">₹{product.price}</span>
                      <span className="text-xs text-muted-foreground">
                        {product.variants?.length || 0} variants
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProduct(editingProduct === product.slug ? null : product.slug);
                        setExpandedProduct(product.slug);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {expandedProduct === product.slug ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedProduct === product.slug && (
                  <div className="border-t border-border/50 p-4 bg-muted/30">
                    {editingProduct === product.slug ? (
                      /* Edit Mode */
                      <div className="space-y-6">
                        {/* Basic Info */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h4>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium mb-1 block">Name (English)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.name}
                                onChange={(e) => updateProduct(product.slug, 'name', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Name (Hindi)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.nameHi}
                                onChange={(e) => updateProduct(product.slug, 'nameHi', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Slug (URL)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.slug}
                                onChange={(e) => {
                                  const newSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                                  updateProduct(product.slug, 'slug', newSlug);
                                  updateProduct(product.slug, 'id', newSlug);
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Price (₹)</label>
                              <input
                                type="number"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.price}
                                onChange={(e) => updateProduct(product.slug, 'price', Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Category (English)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.category}
                                onChange={(e) => updateProduct(product.slug, 'category', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Category (Hindi)</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.categoryHi}
                                onChange={(e) => updateProduct(product.slug, 'categoryHi', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Main Image Path</label>
                              <input
                                type="text"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={product.mainImage}
                                onChange={(e) => updateProduct(product.slug, 'mainImage', e.target.value)}
                                placeholder="/products/image.png"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`inStock-${product.slug}`}
                                checked={product.inStock}
                                onChange={(e) => updateProduct(product.slug, 'inStock', e.target.checked)}
                                className="rounded"
                              />
                              <label htmlFor={`inStock-${product.slug}`} className="text-sm font-medium">In Stock</label>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Description</h4>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium mb-1 block">English</label>
                              <textarea
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                value={product.description}
                                onChange={(e) => updateProduct(product.slug, 'description', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-1 block">Hindi</label>
                              <textarea
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                value={product.descriptionHi}
                                onChange={(e) => updateProduct(product.slug, 'descriptionHi', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Features */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Features</h4>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium mb-2 block">English</label>
                              {product.features?.map((feature, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={feature}
                                    onChange={(e) => updateArrayField(product.slug, 'features', idx, e.target.value)}
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-9 w-9 text-red-500"
                                    onClick={() => removeArrayItem(product.slug, 'features', idx)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addArrayItem(product.slug, 'features', 'New feature')}
                              >
                                <Plus className="h-4 w-4 mr-1" /> Add
                              </Button>
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-2 block">Hindi</label>
                              {product.featuresHi?.map((feature, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                  <input
                                    type="text"
                                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={feature}
                                    onChange={(e) => updateArrayField(product.slug, 'featuresHi', idx, e.target.value)}
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-9 w-9 text-red-500"
                                    onClick={() => removeArrayItem(product.slug, 'featuresHi', idx)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addArrayItem(product.slug, 'featuresHi', 'नई विशेषता')}
                              >
                                <Plus className="h-4 w-4 mr-1" /> Add
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Variants */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Variants</h4>
                          <div className="space-y-3">
                            {product.variants?.map((variant, idx) => (
                              <div key={variant.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                                <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                  {variant.image && (
                                    <Image src={variant.image} alt={variant.name} fill className="object-cover" />
                                  )}
                                </div>
                                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Variant name"
                                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={variant.name}
                                    onChange={(e) => {
                                      const newVariants = [...product.variants];
                                      newVariants[idx] = { ...variant, name: e.target.value };
                                      updateProduct(product.slug, 'variants', newVariants);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="/products/image.png"
                                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
                                    value={variant.image}
                                    onChange={(e) => {
                                      const newVariants = [...product.variants];
                                      newVariants[idx] = { ...variant, image: e.target.value };
                                      updateProduct(product.slug, 'variants', newVariants);
                                    }}
                                  />
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="text-red-500"
                                  onClick={() => {
                                    const newVariants = product.variants.filter((_, i) => i !== idx);
                                    updateProduct(product.slug, 'variants', newVariants);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const newVariants = [
                                  ...product.variants,
                                  { id: `v-${Date.now()}`, name: 'New Variant', image: '/products/placeholder.png' }
                                ];
                                updateProduct(product.slug, 'variants', newVariants);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Variant
                            </Button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => deleteProduct(product.slug)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Product
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingProduct(null)}
                          >
                            Done Editing
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {product.features?.slice(0, 4).map((feature, idx) => (
                            <Badge key={idx} variant="outline">{feature}</Badge>
                          ))}
                          {product.features?.length > 4 && (
                            <Badge variant="outline">+{product.features.length - 4} more</Badge>
                          )}
                        </div>
                        {product.variants?.length > 1 && (
                          <div className="flex gap-2">
                            {product.variants.map((variant) => (
                              <div key={variant.id} className="relative h-12 w-12 rounded-lg overflow-hidden border border-border">
                                <Image src={variant.image} alt={variant.name} fill className="object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setEditingProduct(product.slug)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Product
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">Get started by adding your first product.</p>
            <Button onClick={addProduct} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
