import Head from "next/head";
import React from "react";
import "../styles/Home.module.css";
import { HeroCarousel } from "../components/ui/hero-carousel";
import { ProductShowcase } from "../components/ui/product-showcase";
import { Branches } from "../components/ui/branches";

export default function Home() {
  return (
    <React.Fragment>
      <Head>
        <title>Hanumant Marble - Premium Marble & Tiles</title>
        <meta 
          name="description" 
          content="Discover premium quality marble, tiles, and stones at Hanumant Marble. Visit our branches across India for the best selection and expert service."
        />
      </Head>
      <main>
        <HeroCarousel />
        <ProductShowcase />
        <Branches />
      </main>
    </React.Fragment>
  );
}
