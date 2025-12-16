"use client";

import React from "react";
import "../styles/Home.module.css";
import { HeroCarousel } from "../components/ui/hero-carousel";
import { ProductShowcase } from "../components/ui/product-showcase";
import { Branches } from "../components/ui/branches";

export default function Home() {
  return (
    <React.Fragment>
      <main>
        <HeroCarousel />
        <ProductShowcase />
        <Branches />
      </main>
    </React.Fragment>
  );
}
