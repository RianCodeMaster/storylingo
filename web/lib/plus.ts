import type { Edition } from "./editions";
import { type Limits, type Product, plusOf } from "./products";
import { supabase } from "./supabase";
import type { StoryCard } from "./types";

/**
 * The free tier and Plus (docs/plus.md). An edition whose language has a membership product gives without it per
 * level the first stories and phrases, and per day a few new ones; with it, everything. The database enforces what
 * may be read (and the daily new stories); this file tells the app what to show: locks, counts and the moments to
 * offer Plus.
 */
export interface Tier {
  plus: Product | null; // the membership of this edition (null: no limits here at all)
  has: boolean; // the learner has it
  limits: Limits | null; // the limits that apply to this learner (null: none)
}

export function tierOf(edition: Edition, owned: Set<string>): Tier {
  const plus = plusOf(edition);
  const has = !!plus && owned.has(plus.slug);
  return { plus, has, limits: plus && !has ? plus.free : null };
}

/** A story the learner cannot open: a pack they do not have, or outside the free part without Plus. */
export const isLocked = (story: StoryCard, tier: Tier, owned: Set<string>) =>
  story.product ? !owned.has(story.product) : !story.free && !!tier.limits;

/** The start of today on this device (the database counts from midnight in Central Europe, where learners live). */
export const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export interface Usage {
  newStories: number; // stories started today for the first time
  startedEver: Set<string>; // every story ever started (replaying those is free)
  newPhrases: number; // phrases practised today for the first time
  reviews: number; // word review cards answered today (not counting new phrases)
}

/** What the learner did today, to compare with the limits. */
export async function usageToday(): Promise<Usage> {
  const since = todayStart();
  const sb = supabase();
  const [{ data: sessions, error: e1 }, { data: today, error: e2 }] = await Promise.all([
    sb.from("sessions").select("story_id, started_at"),
    sb.from("reviews").select("lexeme_id, lexemes!inner ( phrases ( level ) )").gte("created_at", since),
  ]);
  if (e1 || e2) throw e1 ?? e2;

  const first = new Map<string, string>();
  for (const s of sessions) {
    const at = first.get(s.story_id);
    if (!at || s.started_at < at) first.set(s.story_id, s.started_at);
  }
  const newStories = [...first.values()].filter((at) => at >= since).length;

  // A phrase is new today when it has no review before today.
  const phraseIds = [...new Set(today.filter((r) => hasPhrase(r.lexemes)).map((r) => r.lexeme_id as string))];
  let older = new Set<string>();
  if (phraseIds.length) {
    const { data, error } = await sb.from("reviews").select("lexeme_id").in("lexeme_id", phraseIds).lt("created_at", since);
    if (error) throw error;
    older = new Set(data.map((r) => r.lexeme_id as string));
  }
  const fresh = new Set(phraseIds.filter((id) => !older.has(id)));
  return {
    newStories,
    startedEver: new Set(first.keys()),
    newPhrases: fresh.size,
    reviews: today.filter((r) => !fresh.has(r.lexeme_id as string)).length,
  };
}

function hasPhrase(lexeme: unknown): boolean {
  const l = (Array.isArray(lexeme) ? lexeme[0] : lexeme) as { phrases?: unknown } | null;
  const p = l?.phrases;
  return Array.isArray(p) ? p.length > 0 : !!p;
}

/** Whether today's free new story is used up (replaying a story already started stays possible). */
export const storyLimitReached = (tier: Tier, usage: Usage) =>
  !!tier.limits && usage.newStories >= tier.limits.stories_per_day;
