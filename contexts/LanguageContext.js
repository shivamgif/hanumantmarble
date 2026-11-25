"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { loadLanguage } from '@/lib/translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      loadLanguage(savedLanguage).then(() => setLanguage(savedLanguage));
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Switch only once the new language's strings are in, so nothing renders
  // half-translated.
  const toggleLanguage = useCallback(() => {
    const newLanguage = language === 'en' ? 'hi' : 'en';
    localStorage.setItem('language', newLanguage);
    loadLanguage(newLanguage).then(() => setLanguage(newLanguage));
  }, [language]);

  const contextValue = useMemo(() => ({ language, toggleLanguage }), [language, toggleLanguage]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
