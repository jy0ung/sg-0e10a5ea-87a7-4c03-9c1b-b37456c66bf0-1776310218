import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';

// Scaffold only: English bundle seeded, additional locales can be added
// under `locales/` and registered here. All hardcoded UI strings should
// migrate to `t('namespace.key')` incrementally.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'flc-i18n-lang',
    },
  });

export default i18n;
