import React, { createContext, useContext } from 'react';
import type { SupportedLocale } from '../types/domain';
import { TRANSLATIONS } from './translations';

interface I18nContextValue {
  locale: SupportedLocale;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: (key, fallback) => TRANSLATIONS.en[key] ?? fallback ?? key,
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: SupportedLocale;
  children: React.ReactNode;
}) {
  const t = (key: string, fallback?: string): string => {
    return TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS.en[key] ?? fallback ?? key;
  };

  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
