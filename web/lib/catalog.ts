import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { type Edition, EDITIONS, showsEverything } from "./editions";

/**
 * The stories as search engines and first-time visitors see them: on the server, at build time and then cached,
 * with the publishable key and no learner. So the database decides what is public, the same way as for a visitor
 * in the app: a free story with all its scenes, a Plus or pack story with only its title, summary and picture.
 * The pages in app/[edition]/read and app/[edition]/level are made from this (docs/seo.md).
 */

export interface PublicCard {
  id: string;
  slug: string;
  title: string;
  level: string;
  summary: string | null;
  free: boolean;
  product: string | null;
  cover: string | null;
}

export interface PublicScene {
  position: number;
  text: string;
  translation: string | null;
  image: string | null;
}

export interface PublicStory extends PublicCard {
  /** Empty when the story is locked: its text stays in the database. */
  scenes: PublicScene[];
  words: { text: string; gloss: string | null }[];
}

type Asset = { id: string; storage_path: string } | { id: string; storage_path: string }[] | null;

/** A public file of the assets bucket. Online Supabase's own address; locally through the /sb rewrite. */
function fileUrl(asset: Asset): string | null {
  const a = Array.isArray(asset) ? asset[0] : asset;
  if (!a) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "/sb";
  return `${base}/storage/v1/object/public/assets/${a.storage_path}?v=${a.id}`;
}

function server() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see web/.env.example)");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_LOCAL_URL || "http://127.0.0.1:54321";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The editions search engines may see: not the drafts (those exist only for the owner). */
export const publicEditions = (): Edition[] =>
  Object.values(EDITIONS).filter((e) => e.status !== "draft" || showsEverything());

/** An edition's stories, easiest first, in the same order and selection as the app (lib/story.ts, listStories). */
export async function publicStories(editionSlug: string): Promise<PublicCard[]> {
  "use cache";
  cacheLife("hours");
  const edition = EDITIONS[editionSlug];
  if (!edition) return [];
  const { data, error } = await server()
    .from("story_cards")
    .select("id, slug, title, cefr_level, summary, free, product, cover_id, cover_path")
    .eq("base_language", edition.base)
    .eq("language_code", edition.target)
    .overlaps("tags", edition.stories.tags)
    .in("cefr_level", edition.stories.levels)
    .order("cefr_level")
    .order("published_at")
    .order("slug");
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    level: s.cefr_level,
    summary: s.summary,
    free: s.free,
    product: s.product,
    cover: s.cover_id ? fileUrl({ id: s.cover_id, storage_path: s.cover_path }) : null,
  }));
}

/** One story of an edition by its slug, or null when the edition does not show it. */
export async function publicStory(editionSlug: string, slug: string): Promise<PublicStory | null> {
  "use cache";
  cacheLife("hours");
  const card = (await publicStories(editionSlug)).find((s) => s.slug === slug);
  if (!card) return null;
  const base = EDITIONS[editionSlug].base;
  // A locked story comes back empty (row level security), and then only its card is shown.
  const { data, error } = await server()
    .from("stories")
    .select(
      `story_targets ( lexemes ( text, lexeme_glosses ( gloss ) ) ),
       scenes ( position, text, scene_localizations ( translation ), image:assets!image_asset_id ( id, storage_path ) )`,
    )
    .eq("id", card.id)
    .eq("story_targets.lexemes.lexeme_glosses.base_language", base)
    .eq("scenes.scene_localizations.base_language", base)
    .order("position", { referencedTable: "scenes" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...card, scenes: [], words: [] };
  type Lexeme = { text: string; lexeme_glosses: { gloss: string }[] };
  type SceneRow = { position: number; text: string; scene_localizations: { translation: string }[]; image: Asset };
  const words = (data.story_targets as unknown as { lexemes: Lexeme | Lexeme[] | null }[])
    .map((t) => (Array.isArray(t.lexemes) ? t.lexemes[0] : t.lexemes))
    .filter((l): l is Lexeme => !!l)
    .map((l) => ({ text: l.text, gloss: l.lexeme_glosses[0]?.gloss ?? null }));
  const scenes = (data.scenes as unknown as SceneRow[]).map((s) => ({
    position: s.position,
    text: s.text,
    translation: s.scene_localizations[0]?.translation ?? null,
    image: fileUrl(s.image),
  }));
  return { ...card, scenes, words };
}

/**
 * The same story in the other editions of its language (Arabic, Dutch, English around the same German story), for
 * the hreflang links that tell search engines these pages are one story in several languages.
 */
export async function storyLanguages(editionSlug: string, slug: string): Promise<Record<string, string>> {
  const { target, base } = EDITIONS[editionSlug];
  const out: Record<string, string> = { [base]: `/${editionSlug}/read/${slug}` };
  for (const e of publicEditions().filter((e) => e.target === target)) {
    // One edition per base language: the first, so the same address is chosen every time.
    if (out[e.base]) continue;
    if ((await publicStories(e.slug)).some((s) => s.slug === slug)) out[e.base] = `/${e.slug}/read/${slug}`;
  }
  return out;
}
