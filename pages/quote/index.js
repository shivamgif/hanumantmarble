"use client"

import { useState } from 'react';
import Head from "next/head";
import { ProductForm } from '@/components/ui/product-form';
import { Badge } from '@/components/ui/badge';

export default function Quote() {
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        alert('Thank you for your inquiry. We will get back to you soon!');
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      alert('Sorry, there was an error submitting your form. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Get a Quote - Hanumant Marble</title>
        <meta 
          name="description" 
          content="Request a quote for premium marble and granite products from Hanumant Marble. We offer competitive pricing and excellent service."
        />
      </Head>
      <div className="container mx-auto min-h-screen py-16 px-4 space-y-8">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">Get Your Quote</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Fill out the form below and our team will provide you with a detailed quote for your project
          </p>
          <div className="flex items-center justify-center gap-4">
            <Badge variant="secondary">Premium Quality</Badge>
            <Badge variant="secondary">Competitive Pricing</Badge>
            <Badge variant="secondary">Expert Consultation</Badge>
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
