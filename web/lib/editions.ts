import editions from "./editions.json";

/**
 * Every edition, generated from content/editions/*.yaml by `storylingo.py sync` (never edit editions.json by hand).
 * An edition is the app as one niche sees it, at its own address: it fixes the base language (texts around the
 * story) and the target language (the stories), and brings its own name, welcome texts and color.
 */
export interface Edition {
  slug: string;
  status: "draft" | "beta" | "live";
  base: string;
  target: string;
  name: string;
  tagline: string;
  intro: string;
  color: string;
  stories: { tags: string[]; levels: string[] };
}

export const EDITIONS = editions as Record<string, Edition>;
export const isEdition = (slug: string | undefined): slug is string => !!slug && slug in EDITIONS;
