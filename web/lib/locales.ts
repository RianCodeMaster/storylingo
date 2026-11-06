/**
 * The base languages the app speaks (each has web/dictionaries/<code>.json), shared by the proxy, the pages and the
 * language menu. Each is named in its own language, so a learner finds theirs whatever the page is in.
 */
export const LOCALES = ["nl", "en"] as const;
export const DEFAULT_LOCALE = "nl";
export const LOCALE_NAMES: Record<string, string> = { nl: "Nederlands", en: "English" };

/** Set when the learner picks a language in the menu; the proxy prefers it over the browser's language. */
export const LOCALE_COOKIE = "lang";

export function rememberLocale(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
