/**
 * Which base language a visitor most likely reads, from what their browser sends: used by the proxy (where
 * qissio.com and a video code without an edition lead) and by the landing page at / (which language it opens in).
 * Data only, the same for every edition: a new base language needs a line in BASES, nothing else.
 */

// The base languages that have editions, each with the edition that teaches German (the largest niche).
export const EDITION_FOR: Record<string, string> = { nl: "duits", en: "german", ar: "almanya" };
export const FALLBACK_BASE = "en";

/** The visitor's languages from the browser, most wanted first ("ar-SA,ar;q=0.9,en;q=0.8" → ar, ar, en). */
export function languages(header: string | null): string[] {
  return (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((l) => l.lang && !Number.isNaN(l.q))
    .sort((a, b) => b.q - a.q)
    .map((l) => l.lang);
}

// The base language of a country where browsers often say English while people read another language at home (a
// Dutch laptop with English Windows). Only used when the browser's own choice is English (or has no edition): data,
// one line per country, for every edition alike. The country comes from Vercel and is not stored.
const COUNTRY_BASE: Record<string, string> = {
  NL: "nl", BE: "nl", SR: "nl",
  MA: "ar", DZ: "ar", TN: "ar", LY: "ar", EG: "ar", SD: "ar", SY: "ar", LB: "ar", JO: "ar", PS: "ar", IQ: "ar",
  SA: "ar", AE: "ar", QA: "ar", KW: "ar", BH: "ar", OM: "ar", YE: "ar", MR: "ar",
};

/**
 * The browser's language, but English only weakly: in a country with its own base language (the Netherlands,
 * Morocco …) that country's language wins, since many there have English Windows or phones. Else English.
 */
export function guessBase(acceptLanguage: string | null, country: string | null): string {
  const fromCountry = COUNTRY_BASE[country?.toUpperCase() ?? ""];
  const lang = languages(acceptLanguage).find((l) => EDITION_FOR[l]);
  const base = (!lang || lang === "en") && fromCountry && EDITION_FOR[fromCountry] ? fromCountry : lang;
  return base ?? FALLBACK_BASE;
}

// The visitor's last edition, kept in their browser for a year, so qissio.com brings them back to it (and to their
// progress there) whatever their browser's language. A preference, not tracking: it holds only the edition's name.
export const EDITION_COOKIE = "qissio_edition";
