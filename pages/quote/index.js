"use client"

import { useState } from 'react';
import { ProductForm } from '@/components/ui/product-form';

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
    <div className="min-h-screen py-12 px-4 md:px-6 flex items-center justify-center">
      <ProductForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </div>
  );
}
