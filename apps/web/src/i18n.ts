import { type I18n, setupI18n } from "@lingui/core";

import { messages as en } from "@/locales/en/messages.po";
import { messages as ru } from "@/locales/ru/messages.po";

// The UI text is Russian in the code, and English is a translation (ADR 0004).

export const locales = ["ru", "en"] as const;
export type Locale = (typeof locales)[number];

const storageKey = "arashan.locale";

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}

/** The language that the user selected last time, or Russian. */
export function savedLocale(): Locale {
  const saved = localStorage.getItem(storageKey);
  return isLocale(saved) ? saved : "ru";
}

export function createI18n(locale: Locale): I18n {
  const i18n = setupI18n({ locale, messages: { ru, en } });
  document.documentElement.lang = locale;
  return i18n;
}

/** Shows the UI in another language, and remembers it for the next visit. */
export function changeLocale(i18n: I18n, locale: Locale) {
  i18n.activate(locale);
  localStorage.setItem(storageKey, locale);
  document.documentElement.lang = locale;
}
