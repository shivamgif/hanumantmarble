"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getProductBySlug, products } from '@/lib/products';
import { useCart } from '@/contexts/CartContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Check, 
  ChevronRight, 
  Star, 
  Truck, 
  Shield, 
  RotateCcw,
  Minus,
  Plus,
  Package,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ProductPage() {
  const params = useParams();
  const { language } = useLanguage();
  const { addItem } = useCart();
  const product = getProductBySlug(params.slug);
  
  const [selectedVariant, setSelectedVariant] = useState(product?.variants?.[0] || null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 flex items-center justify-center">
        <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl p-8 text-center max-w-md">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Product Not Found</h1>
          <p className="text-muted-foreground mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Button asChild className="rounded-full">
            <Link href="/#products">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Products
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem({
      id: `${product.id}-${selectedVariant?.id || 'default'}`,
      name: `${language === 'hi' ? product.nameHi : product.name}${selectedVariant ? ` - ${selectedVariant.name}` : ''}`,
      price: product.price,
      image: selectedVariant?.image || product.mainImage,
      currency: "INR",
      quantity: quantity,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const currentImage = selectedVariant?.image || product.mainImage;
  const productName = language === 'hi' ? product.nameHi : product.name;
  const productDescription = language === 'hi' ? product.descriptionHi : product.description;
  const productFeatures = language === 'hi' ? product.featuresHi : product.features;
  const productCategory = language === 'hi' ? product.categoryHi : product.category;

  // Get related products (same category, excluding current)
  const relatedProducts = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/#products" className="hover:text-primary transition-colors">Products</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{productName}</span>
        </nav>

        {/* Main Product Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
                  <Image
                    src={currentImage}
                    alt={productName}
                    fill
                    className="object-contain p-8"
                    priority
                  />
                  {/* Badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {product.inStock && (
                      <Badge className="bg-green-500/90 text-white border-0">In Stock</Badge>
                    )}
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                      {productCategory}
                    </Badge>
                  </div>
                  {/* Wishlist Button */}
                  <button
                    onClick={() => setIsWishlisted(!isWishlisted)}
                    className={cn(
                      "absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
                      isWishlisted 
                        ? "bg-pink-500 text-white" 
                        : "bg-white/90 dark:bg-black/70 text-foreground hover:bg-pink-50 dark:hover:bg-pink-500/20"
                    )}
                  >
                    <Heart className={cn("h-5 w-5", isWishlisted && "fill-current")} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Variant Thumbnails */}
            {product.variants.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={cn(
                      "relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all duration-300",
                      selectedVariant?.id === variant.id
                        ? "border-primary shadow-lg scale-105"
                        : "border-border/50 hover:border-primary/50"
                    )}
                  >
                    <Image
                      src={variant.image}
                      alt={variant.name}
                      fill
                      className="object-contain p-2 bg-muted/50"
                    />
                    {selectedVariant?.id === variant.id && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Variant Names */}
            {product.variants.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                      selectedVariant?.id === variant.id
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Title & Rating */}
            <div>
              <Badge variant="outline" className="mb-3 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" />
                {productCategory}
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3">{productName}</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-5 w-5",
                        i < Math.floor(product.rating)
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-muted-foreground"
                      )}
                    />
                  ))}
                  <span className="ml-2 font-medium">{product.rating}</span>
                </div>
                <span className="text-muted-foreground">({product.reviews} reviews)</span>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold">₹{product.price.toLocaleString()}</span>
              <span className="text-muted-foreground">(Incl. of all taxes)</span>
            </div>

            {/* Short Description */}
            <p className="text-muted-foreground text-lg leading-relaxed">
              {productDescription}
            </p>

            {/* Quantity Selector */}
            <div className="flex items-center gap-4">
              <span className="font-medium">Quantity:</span>
              <div className="flex items-center rounded-full border border-border overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-10 w-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-10 w-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleAddToCart}
                size="lg"
                className={cn(
                  "flex-1 rounded-full h-14 text-lg transition-all duration-300",
                  addedToCart 
                    ? "bg-green-500 hover:bg-green-600" 
                    : "bg-primary hover:bg-primary/90"
                )}
              >
                {addedToCart ? (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Add to Cart
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full h-14"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: productName,
                      text: productDescription,
                      url: window.location.href,
                    });
                  }
                }}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                  <Truck className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-xs text-muted-foreground">Free Delivery</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <Shield className="h-5 w-5 text-green-500" />
                </div>
                <p className="text-xs text-muted-foreground">Quality Assured</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
                  <RotateCcw className="h-5 w-5 text-orange-500" />
                </div>
                <p className="text-xs text-muted-foreground">Easy Returns</p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl mb-16">
          <CardContent className="p-6">
            {/* Tab Headers */}
            <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
              {['description', 'features', 'specifications'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-6 py-3 font-medium capitalize whitespace-nowrap transition-all duration-300 border-b-2",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[200px]">
              {activeTab === 'description' && (
                <div className="prose prose-lg dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">{productDescription}</p>
                </div>
              )}

              {activeTab === 'features' && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {productFeatures.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-green-500" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}

              {activeTab === 'specifications' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-3 rounded-lg bg-muted/50">
                      <span className="font-medium">{key}</span>
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <Link key={relatedProduct.id} href={`/products/${relatedProduct.slug}`}>
                  <Card className="group bg-card/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
                        <Image
                          src={relatedProduct.mainImage}
                          alt={language === 'hi' ? relatedProduct.nameHi : relatedProduct.name}
                          fill
                          className="object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {language === 'hi' ? relatedProduct.nameHi : relatedProduct.name}
                        </h3>
                        <p className="text-lg font-bold mt-1">₹{relatedProduct.price.toLocaleString()}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
