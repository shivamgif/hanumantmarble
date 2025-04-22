"use client";

import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

const translations = { en, hi };

export function getTranslation(key, language = 'en') {
  const keys = key.split('.');
  let value = translations[language];

  for (const k of keys) {
    if (!value || !value[k]) {
      console.warn(`Translation missing for key: ${key} in language: ${language}`);
      return key;
    }
    value = value[k];
  }

  return value;
}
