import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import ptBR from "./pt-BR";
import { persistLocale, readStoredLocale } from "@/theme/theme";

export const supportedLocales = ["pt-BR", "en"] as const;
export type Locale = (typeof supportedLocales)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (supportedLocales as readonly string[]).includes(value);
}

/** Primeiro idioma: escolha salva, depois sistema, depois inglês. */
export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (isLocale(stored)) return stored;

  const preferred = navigator.languages?.[0] ?? navigator.language;
  return preferred.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export function syncDocumentLanguage(locale: string): void {
  document.documentElement.lang = locale;
}

void i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    en: { translation: en },
  },
  lng: detectLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

syncDocumentLanguage(i18n.language);

i18n.on("languageChanged", (locale) => {
  if (isLocale(locale)) {
    persistLocale(locale);
    syncDocumentLanguage(locale);
  }
});

export default i18n;
