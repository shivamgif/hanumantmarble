import Head from "next/head";
import React from "react";
import "../styles/Home.module.css";
import { HeroCarousel } from "../components/ui/hero-carousel";
import { ProductShowcase } from "../components/ui/product-showcase";
import { Branches } from "../components/ui/branches";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";

export default function Home() {
  const { language } = useLanguage();

  return (
    <React.Fragment>
      <Head>
        <title>{getTranslation('meta.title', language)}</title>
        <meta 
          name="description" 
          content={getTranslation('meta.description', language)}
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
