import { type AssetRef, assetUrl, type One, one } from "./assets";
import { type Grade, SRS_COLUMNS, type SrsRow, toColumns } from "./srs";
import { supabase } from "./supabase";
import type { GlossEntry } from "./types";

export type { Grade } from "./srs";

export interface ReviewCard {
  srs: SrsRow; // when it comes back (lib/srs.ts)
  lexemeId: string;
  language: string;
  text: string;
  gloss: string | null;
  emoji: string | null;
  gesture: string | null;
  audioUrl: string | null;
  imageUrl: string | null; // core words have a picture
  /** A sentence from a story where the learner met this word, and the form it had there. */
  sentence: string | null;
  form: string | null;
}

interface StateRow extends SrsRow {
  lexeme_id: string;
  lexemes: One<{
    text: string;
    language_code: string;
    lexeme_glosses: { gloss: string }[];
    audio: AssetRef;
    image: AssetRef;
    concepts: One<{ gestures: One<{ emoji: string | null; gesture_localizations: { description: string }[] }> }>;
    words: One<{ example: string }>; // a word of the word trainer: its example sentence
  }>;
}

/** Everything due before the end of today: reviewing in the evening should not hide tomorrow morning's words. */
function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * What is due: a card in review (days apart) any time today; a card in (re)learning (minutes apart) only once its
 * minutes have passed, so it never comes back right after the answer.
 */
const dueFilter = () => {
  const now = new Date().toISOString();
  const today = endOfToday();
  return `due_at.lte.${now},and(state.eq.2,due_at.lte.${today}),and(state.is.null,due_at.lte.${today})`;
};

/** Words due today in this target language: an edition only reviews its own language. */
export async function countDue(target: string): Promise<number> {
  const { count, error } = await supabase()
    .from("user_lexeme_state")
    .select("lexeme_id, lexemes!inner ( language_code )", { count: "exact", head: true })
    .eq("lexemes.language_code", target)
    .or(dueFilter());
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

/** Today's cards in the target language, with meanings and gestures in the learner's base language. */
export async function loadDue(base: string, target: string): Promise<ReviewCard[]> {
  const [{ data, error }, context] = await Promise.all([
    supabase()
      .from("user_lexeme_state")
      .select(
        `lexeme_id, ${SRS_COLUMNS},
         lexemes!inner ( text, language_code, lexeme_glosses ( gloss ), audio:assets!audio_asset_id ( id, storage_path ),
                   image:assets!image_asset_id ( id, storage_path ),
                   concepts ( gestures ( emoji, gesture_localizations ( description ) ) ), words ( example ) )`,
      )
      .eq("lexemes.language_code", target)
      .eq("lexemes.lexeme_glosses.base_language", base)
      .eq("lexemes.concepts.gestures.gesture_localizations.base_language", base)
      .or(dueFilter())
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
      imageUrl: assetUrl(lexeme.image),
      // The sentence from a story where it was met; else, for a word of the word trainer, its example sentence.
      sentence: ctx?.sentence ?? one(lexeme.words)?.example ?? null,
      form: ctx?.form ?? lexeme.text,
      srs: {
        state: row.state, stability: row.stability, difficulty: row.difficulty, reps: row.reps, lapses: row.lapses,
        learning_steps: row.learning_steps, scheduled_days: row.scheduled_days, last_review: row.last_review,
        due_at: row.due_at, exposures: row.exposures, correct: row.correct,
      },
    }];
  });
}

/** The current state of items this learner has practised (to practise them again before they are due). */
export async function loadStates(ids: string[]): Promise<Map<string, SrsRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase()
    .from("user_lexeme_state")
    .select(`lexeme_id, ${SRS_COLUMNS}`)
    .in("lexeme_id", ids)
    .returns<(SrsRow & { lexeme_id: string })[]>();
  if (error) throw error;
  return new Map(data.map(({ lexeme_id, ...row }) => [lexeme_id, row]));
}

/** Save an answer: the item's new state (lib/srs.ts, schedule) and a line in the review log. */
export async function saveGrade(userId: string, lexemeId: string, grade: Grade, row: SrsRow) {
  const sb = supabase();
  const [state, log] = await Promise.all([
    sb.from("user_lexeme_state").upsert({ user_id: userId, lexeme_id: lexemeId, ...toColumns(row) }),
    sb.from("reviews").insert({ user_id: userId, lexeme_id: lexemeId, grade, interval_days: row.scheduled_days }),
  ]);
  if (state.error) throw state.error;
  if (log.error) throw log.error;
}
