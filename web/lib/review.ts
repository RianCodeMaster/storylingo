import { type AssetRef, assetUrl, type One, one } from "./assets";
import { supabase } from "./supabase";
import type { GlossEntry } from "./types";

export type Grade = "again" | "hard" | "good";

interface SrsState {
  exposures: number;
  correct: number;
  ease: number;
  interval_days: number;
}

export interface ReviewCard extends SrsState {
  lexemeId: string;
  language: string;
  text: string;
  gloss: string | null;
  emoji: string | null;
  gesture: string | null;
  audioUrl: string | null;
  /** A sentence from a story where the learner met this word, and the form it had there. */
  sentence: string | null;
  form: string | null;
}

interface StateRow extends SrsState {
  lexeme_id: string;
  lexemes: One<{
    text: string;
    language_code: string;
    lexeme_glosses: { gloss: string }[];
    audio: AssetRef;
    concepts: One<{ gestures: One<{ emoji: string | null; gesture_localizations: { description: string }[] }> }>;
  }>;
}

/** Everything due before the end of today: reviewing in the evening should not hide tomorrow morning's words. */
function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function countDue(): Promise<number> {
  const { count, error } = await supabase()
    .from("user_lexeme_state")
    .select("lexeme_id", { count: "exact", head: true })
    .lte("due_at", endOfToday());
  if (error) throw error;
  return count ?? 0;
}

/** The sentence from the stories where each word first appeared, so a card shows the word in context. */
async function contexts(): Promise<Map<string, { sentence: string; form: string }>> {
  const { data, error } = await supabase().from("scenes").select("text, glossary");
  if (error) throw error;
  const found = new Map<string, { sentence: string; form: string }>();
  for (const scene of data as { text: string; glossary: GlossEntry[] }[]) {
    const sentences = scene.text.split(/(?<=[.!?…])\s+/);
    for (const entry of scene.glossary ?? []) {
      if (found.has(entry.lexeme_id)) continue;
      const sentence = sentences.find((s) => s.toLowerCase().includes(entry.word.toLowerCase()));
      if (sentence) found.set(entry.lexeme_id, { sentence, form: entry.word });
    }
  }
  return found;
}

/** Today's cards, with meanings and gestures in the learner's base language. */
export async function loadDue(base: string): Promise<ReviewCard[]> {
  const [{ data, error }, context] = await Promise.all([
    supabase()
      .from("user_lexeme_state")
      .select(
        `lexeme_id, exposures, correct, ease, interval_days,
         lexemes ( text, language_code, lexeme_glosses ( gloss ), audio:assets!audio_asset_id ( id, storage_path ),
                   concepts ( gestures ( emoji, gesture_localizations ( description ) ) ) )`,
      )
      .eq("lexemes.lexeme_glosses.base_language", base)
      .eq("lexemes.concepts.gestures.gesture_localizations.base_language", base)
      .lte("due_at", endOfToday())
      .order("due_at")
      .returns<StateRow[]>(),
    contexts(),
  ]);
  if (error) throw error;

  return data.flatMap((row) => {
    const lexeme = one(row.lexemes);
    if (!lexeme) return [];
    const gesture = one(one(lexeme.concepts)?.gestures ?? null);
    // Target structures are not in the glossary: find them in a story sentence by their own text.
    const ctx = context.get(row.lexeme_id);
    return [{
      lexemeId: row.lexeme_id,
      language: lexeme.language_code,
      text: lexeme.text,
      gloss: lexeme.lexeme_glosses[0]?.gloss ?? null,
      emoji: gesture?.emoji ?? null,
      gesture: gesture?.gesture_localizations[0]?.description ?? null,
      audioUrl: assetUrl(lexeme.audio),
      sentence: ctx?.sentence ?? null,
      form: ctx?.form ?? lexeme.text,
      exposures: row.exposures,
      correct: row.correct,
      ease: Number(row.ease),
      interval_days: row.interval_days,
    }];
  });
}

/**
 * Spaced repetition: "good" pushes the next review further away (interval x ease),
 * "hard" only a little, "again" brings it back tomorrow and makes the word harder from now on.
 */
export function nextState(card: SrsState, grade: Grade): SrsState {
  let { ease, interval_days } = card;
  if (grade === "again") {
    ease = Math.max(1.3, ease - 0.2);
    interval_days = 1;
  } else if (grade === "hard") {
    ease = Math.max(1.3, ease - 0.15);
    interval_days = Math.max(1, Math.round(interval_days * 1.2));
  } else {
    interval_days = interval_days < 1 ? 1 : Math.max(interval_days + 1, Math.round(interval_days * ease));
  }
  return {
    exposures: card.exposures + 1,
    correct: card.correct + (grade === "again" ? 0 : 1),
    ease: Math.round(ease * 100) / 100,
    interval_days,
  };
}

/** Save an answer. `next` comes from nextState, so the caller can keep using the new state right away. */
export async function saveGrade(userId: string, card: ReviewCard, grade: Grade, next: SrsState) {
  const sb = supabase();
  const due = new Date(Date.now() + next.interval_days * 24 * 60 * 60 * 1000).toISOString();
  const [state, log] = await Promise.all([
    sb.from("user_lexeme_state").upsert({ user_id: userId, lexeme_id: card.lexemeId, ...next, due_at: due }),
    sb.from("reviews").insert({ user_id: userId, lexeme_id: card.lexemeId, grade, interval_days: next.interval_days }),
  ]);
  if (state.error) throw state.error;
  if (log.error) throw log.error;
}
