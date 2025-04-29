"use client"

import Head from "next/head";
import { ProductForm } from '@/components/ui/product-form';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';

export default function Quote() {
  const { language } = useLanguage();

  return (
    <>
      <Head>
        <title>{getTranslation('quote.pageTitle', language)}</title>
        <meta 
          name="description" 
          content={getTranslation('quote.pageDescription', language)}
        />
      </Head>

      {/* Add hidden form for Netlify form prerendering */}
      <form name="product-quote" data-netlify="true" hidden>
        <input type="text" name="fullname" />
        <input type="email" name="email" />
        <input type="tel" name="mobile" />
        <select name="brand" />
        <input type="text" name="product" />
        <input type="text" name="quantity" />
      </form>

      <div className="container mx-auto min-h-screen py-16 px-4 space-y-8">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">{getTranslation('quote.title', language)}</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {getTranslation('quote.subtitle', language)}
          </p>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="secondary">{getTranslation('quote.badges.quality', language)}</Badge>
            <Badge variant="secondary">{getTranslation('quote.badges.pricing', language)}</Badge>
            <Badge variant="secondary">{getTranslation('quote.badges.consultation', language)}</Badge>
          </div>
        </div>
        <div className="max-w-3xl mx-auto">
          <div className="rounded-lg border bg-card p-8">
            <ProductForm />
          </div>
        </div>
      </div>
    </>
  );
}
