import editions from "./editions.json";

/**
 * Every edition, generated from content/editions/*.yaml by `storylingo.py sync` (never edit editions.json by hand).
 * An edition is the app as one niche sees it, at its own address: it fixes the base language (texts around the
 * story) and the target language (the stories), and brings its own name, welcome texts and color.
 */
/**
 * One way into an edition for one niche, at /<edition>/<track> (docs/campagnes.md): its own welcome and search texts,
 * the level chosen on arrival and the story tags shown first. Everything after the welcome is the edition itself.
 */
export interface Track {
  slug: string;
  title: string;
  description: string;
  tagline: string;
  intro: string;
  level: string | null;
  prefer: string[];
}

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
  tracks: Track[];
}

export const trackOf = (edition: Edition, slug: string | null | undefined) =>
  edition.tracks.find((t) => t.slug === slug) ?? null;

export const EDITIONS = editions as Record<string, Edition>;
export const isEdition = (slug: string | undefined): slug is string => !!slug && slug in EDITIONS;

/**
 * Whether the owner's view is on: the overview at / and draft editions. On while developing, or with SHOW_EDITIONS=1;
 * off in production, so a learner never finds another edition (each niche is marketed as its own app).
 */
export const showsEverything = () => process.env.NODE_ENV !== "production" || process.env.SHOW_EDITIONS === "1";
