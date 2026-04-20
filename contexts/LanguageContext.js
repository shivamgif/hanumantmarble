"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const newLanguage = prev === 'en' ? 'hi' : 'en';
      localStorage.setItem('language', newLanguage);
      return newLanguage;
    });
  }, []);

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
