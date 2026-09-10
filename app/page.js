import { HeroCarousel } from "@/components/ui/hero-carousel";
import { WorkGallery } from "@/components/ui/work-gallery";
import { ProductShowcase } from "@/components/ui/product-showcase";
import { ProductsGrid } from "@/components/ui/products-grid";
import { Branches } from "@/components/ui/branches";

// ponytail: plain imports, no next/dynamic. Every section hydrates on load, so
// splitting them bought no JS while costing a skeleton flash and a layout shift
// on first paint. This page is a server component; the sections are "use client".
export default function Home() {
  return (
    <main>
      <HeroCarousel />
      <WorkGallery />
      <ProductShowcase />
      <ProductsGrid />
      <Branches />
    </main>
  );
}
