"use client"

import { useState } from 'react';
import Head from "next/head";
import { ProductForm } from '@/components/ui/product-form';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';

export default function Quote() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { language } = useLanguage();

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'form-name': 'contact',
          ...formData
        }).toString()
      });
      
      if (response.ok) {
        alert(getTranslation('quote.success', language));
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      alert(getTranslation('quote.error', language));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>{getTranslation('quote.pageTitle', language)}</title>
        <meta 
          name="description" 
          content={getTranslation('quote.pageDescription', language)}
        />
      </Head>
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
            <ProductForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
          </div>
        </div>
      </div>
    </>
  );
}
