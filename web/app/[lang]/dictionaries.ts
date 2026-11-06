import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { DEFAULT_LOCALE } from "@/lib/locales";

// One entry per base language (docs/meertaligheid.md). Adding a language: copy nl.json, add it here and in lib/locales.ts.
const dictionaries = {
  nl: () => import("@/dictionaries/nl.json").then((module) => module.default),
  en: () => import("@/dictionaries/en.json").then((module) => module.default),
};

export type Locale = keyof typeof dictionaries;
export const locales = Object.keys(dictionaries) as Locale[];
export const defaultLocale: Locale = DEFAULT_LOCALE;
const RIGHT_TO_LEFT = new Set(["ar"]);

export const hasLocale = (locale: string): locale is Locale => locale in dictionaries;
export const direction = (locale: string) => (RIGHT_TO_LEFT.has(locale) ? "rtl" : "ltr");

/** The base language of this request and its texts; an unknown language is a 404. */
export async function getDictionary() {
  const locale = await lang();
  if (!hasLocale(locale)) notFound();
  return { locale, dict: await dictionaries[locale]() };
}
