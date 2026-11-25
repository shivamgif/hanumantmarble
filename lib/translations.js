import en from '@/locales/en.json';

// Hindi (about 30 KB gzipped) loads only for people who use it:
// LanguageProvider awaits loadLanguage('hi') before switching, and until then
// 'hi' reads English.
const translations = { en };

export function loadLanguage(language) {
  if (language !== 'hi' || translations.hi) return Promise.resolve();
  return import('@/locales/hi.json').then((module) => {
    translations.hi = module.default;
  });
}

export function getTranslation(key, language = 'en') {
  const keys = key.split('.');
  let value = translations[language] || translations.en;

  for (const k of keys) {
    if (!value || typeof value !== 'object' || !(k in value)) {
      console.warn(`Translation missing for key: ${key} in language: ${language}`);
      return key;
    }
    value = value[k];
  }

  return value;
}
