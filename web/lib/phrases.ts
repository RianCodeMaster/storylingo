import { type AssetRef, assetUrl, type One, one } from "./assets";
import type { Edition } from "./editions";
import type { SrsRow } from "./srs";
import { supabase } from "./supabase";

/**
 * The two card sections of an edition, built the same way: the phrases (chunks people say, pipeline/phrases.py) and
 * the word trainer (single words with an example sentence, pipeline/words.py). Each is a table of its own with the
 * same columns (level, position, topics), its own counts views and its own free limits.
 */
export type Section = "phrases" | "words";
const COUNTS = { phrases: "phrase_counts", words: "word_counts" } as const;
const TOPIC_COUNTS = { phrases: "phrase_topic_counts", words: "word_topic_counts" } as const;

/** One card: the phrase or word in the target language, its meaning in the base language, its audio. */
export interface PhraseCard {
  lexemeId: string;
  text: string;
  meaning: string | null;
  audioUrl: string | null;
  topics: string[]; // health, work, office, … (pipeline/phrases.py TOPICS), the first is the main one
  example?: string | null; // words: a short sentence with the word, and in the base language
  exampleMeaning?: string | null;
  srs?: SrsRow; // practised before (practising again): its state; new cards start empty
}

/** The topics of daily life a phrase can belong to, the same for every language (pipeline/phrases.py TOPICS). */
export const TOPICS = ["health", "work", "office", "shopping", "housing", "travel", "social", "everyday"] as const;
export type Topic = (typeof TOPICS)[number];
export const isTopic = (t: string | null | undefined): t is Topic => !!t && (TOPICS as readonly string[]).includes(t);

/** Per level: how many phrases there are and how many this learner has practised. */
export type PhraseProgress = Record<string, { total: number; learned: number }>;

interface Row {
  lexeme_id: string;
  topics: string[];
  example?: string;
  lexemes: One<{ text: string; lexeme_glosses: { gloss: string; example?: string | null }[]; audio: AssetRef }>;
}

/**
 * The phrases of one level in learning order, with meanings in the edition's base language; with a topic only
 * that topic's (a video about the doctor leads to the doctor's phrases).
 */
export async function loadPhrases(
  edition: Edition,
  level: string,
  topic: Topic | null = null,
  section: Section = "phrases",
): Promise<PhraseCard[]> {
  const words = section === "words";
  let query = supabase()
    .from(section)
    .select(
      `lexeme_id, position, topics${words ? ", example" : ""},
       lexemes!inner ( text, language_code, lexeme_glosses ( gloss${words ? ", example" : ""} ),
         audio:assets!audio_asset_id ( id, storage_path ) )`,
    )
    .eq("level", level)
    .eq("lexemes.language_code", edition.target)
    .eq("lexemes.lexeme_glosses.base_language", edition.base);
  if (topic) query = query.contains("topics", [topic]);
  const { data, error } = await query.order("position").returns<Row[]>();
  if (error) throw error;
  return data.flatMap((row) => {
    const lexeme = one(row.lexemes);
    const gloss = lexeme?.lexeme_glosses[0];
    return lexeme
      ? [{
          lexemeId: row.lexeme_id, text: lexeme.text, meaning: gloss?.gloss ?? null,
          audioUrl: assetUrl(lexeme.audio), topics: row.topics ?? [],
          example: row.example ?? null, exampleMeaning: gloss?.example ?? null,
        }]
      : [];
  });
}

/** How many phrases (or words) a level has in all, also the ones behind Plus (views phrase_counts, word_counts). */
export async function phraseTotal(target: string, level: string, section: Section = "phrases"): Promise<number> {
  const { data, error } = await supabase()
    .from(COUNTS[section])
    .select("total")
    .eq("language_code", target)
    .eq("level", level)
    .maybeSingle();
  if (error) throw error;
  return data?.total ?? 0;
}

/** Per topic, how many phrases a level has in all, also the ones behind Plus (view phrase_topic_counts). */
export async function topicTotals(
  target: string,
  level: string,
  section: Section = "phrases",
): Promise<Partial<Record<Topic, number>>> {
  const { data, error } = await supabase()
    .from(TOPIC_COUNTS[section])
    .select("topic, total")
    .eq("language_code", target)
    .eq("level", level);
  if (error) throw error;
  return Object.fromEntries(data.filter((r) => isTopic(r.topic)).map((r) => [r.topic, r.total]));
}

/**
 * Which phrases (or words) of a target language this learner has practised: they are in spaced repetition. A list
 * word they met in a story and reviewed counts as practised too (it is the same lexeme).
 */
export async function learnedPhrases(target: string, section: Section = "phrases"): Promise<Set<string>> {
  const { data, error } = await supabase()
    .from("user_lexeme_state")
    .select(`lexeme_id, lexemes!inner ( language_code, ${section}!inner ( level ) )`)
    .eq("lexemes.language_code", target);
  if (error) throw error;
  return new Set(data.map((r) => r.lexeme_id as string));
}

/**
 * Per level: how many there are in all (also the ones behind Plus, so "3 of 500", not "3 of 66") and how many this
 * learner has practised. For the home page's tiles.
 */
export async function phraseProgress(target: string, section: Section = "phrases"): Promise<PhraseProgress> {
  const [{ data: counts, error }, { data: rows, error: rowsError }, learned] = await Promise.all([
    supabase().from(COUNTS[section]).select("level, total").eq("language_code", target),
    supabase().from(section).select("lexeme_id, level, lexemes!inner ( language_code )").eq("lexemes.language_code", target),
    learnedPhrases(target, section),
  ]);
  if (error || rowsError) throw error ?? rowsError;
  const progress: PhraseProgress = {};
  for (const c of counts) progress[c.level] = { total: c.total, learned: 0 };
  for (const row of rows) if (learned.has(row.lexeme_id) && progress[row.level]) progress[row.level].learned += 1;
  return progress;
}
