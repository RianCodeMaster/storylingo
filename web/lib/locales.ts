import languages from "./languages.json";

/**
 * Every language the app knows, generated from content/languages/*.yaml by `storylingo.py sync` (never edit
 * languages.json by hand). Base languages (with web/dictionaries/<code>.json) can be chosen as the app's language;
 * target languages bring the teacher's phrases and the words the speech recognizer writes differently.
 */
export interface Language {
  name: string; // in the language itself, so a learner finds theirs whatever the page is in
  direction: "ltr" | "rtl";
  script: string; // picks the font (globals.css)
  speechTag: string | null;
  base: boolean;
  target: boolean;
  teacher?: { yes: string[]; no: string[]; next: string; done: string };
  recognition?: Record<string, string>;
}

export const LANGUAGES = languages as Record<string, Language>;
export const DEFAULT_LOCALE = "nl";

/** The base languages, the default first: the proxy, the pages and the language menu. */
export const LOCALES = Object.keys(LANGUAGES)
  .filter((code) => LANGUAGES[code].base)
  .sort((a, b) => Number(b === DEFAULT_LOCALE) - Number(a === DEFAULT_LOCALE));

export const isLocale = (code: string | undefined): code is string => !!code && LOCALES.includes(code);
export const direction = (code: string) => LANGUAGES[code]?.direction ?? "ltr";
export const script = (code: string) => LANGUAGES[code]?.script ?? "latin";

/** Set when the learner picks a language in the menu; the proxy prefers it over the browser's language. */
export const LOCALE_COOKIE = "lang";

export function rememberLocale(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
