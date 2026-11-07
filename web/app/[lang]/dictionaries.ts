import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import type { Dictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/locales";

/**
 * The base language of this request and its texts (web/dictionaries/<code>.json); an unknown language is a 404.
 * Which languages exist comes from content/languages (see lib/locales.ts), so a new one needs no change here.
 */
export async function getDictionary() {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  const dict = (await import(`@/dictionaries/${locale}.json`)).default as Dictionary;
  return { locale, dict };
}
