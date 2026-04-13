"use client";

import React from "react";
import dynamic from "next/dynamic";
import "../styles/Home.module.css";

const heroPlaceholder = (
  <section className="relative h-[75vh] bg-gradient-to-b from-background via-muted/30 to-background overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
  </section>
);

const sectionPlaceholder = (heightClass) => (
  <section className={`relative ${heightClass} bg-background`}>
    <div className="container mx-auto px-4 py-20">
      <div className="h-8 w-56 rounded-full bg-muted/70 animate-pulse mb-6" />
      <div className="h-5 w-80 max-w-full rounded-full bg-muted/50 animate-pulse mb-4" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    </div>
  </section>
);

const HeroCarousel = dynamic(
  () => import("../components/ui/hero-carousel").then((mod) => mod.HeroCarousel),
  { ssr: false, loading: () => heroPlaceholder }
);

const ProductsGrid = dynamic(
  () => import("../components/ui/products-grid").then((mod) => mod.ProductsGrid),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

const ProductShowcase = dynamic(
  () => import("../components/ui/product-showcase").then((mod) => mod.ProductShowcase),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

const Branches = dynamic(
  () => import("../components/ui/branches").then((mod) => mod.Branches),
  { ssr: false, loading: () => sectionPlaceholder("py-20") }
);

export default function Home() {
  return (
    <React.Fragment>
      <main>
        <HeroCarousel />
        <ProductsGrid />
        <ProductShowcase />
        <Branches />
      </main>
    </React.Fragment>
  );
}
