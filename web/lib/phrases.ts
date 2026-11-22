import { type AssetRef, assetUrl, type One, one } from "./assets";
import type { Edition } from "./editions";
import { supabase } from "./supabase";

/** One chunk of the phrases section: the phrase in the target language, its meaning in the base language, its audio. */
export interface PhraseCard {
  lexemeId: string;
  text: string;
  meaning: string | null;
  audioUrl: string | null;
  topics: string[]; // health, work, office, … (pipeline/phrases.py TOPICS), the first is the main one
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
  lexemes: One<{ text: string; lexeme_glosses: { gloss: string }[]; audio: AssetRef }>;
}

/**
 * The phrases of one level in learning order, with meanings in the edition's base language; with a topic only
 * that topic's (a video about the doctor leads to the doctor's phrases).
 */
export async function loadPhrases(edition: Edition, level: string, topic: Topic | null = null): Promise<PhraseCard[]> {
  let query = supabase()
    .from("phrases")
    .select(
      `lexeme_id, position, topics,
       lexemes!inner ( text, language_code, lexeme_glosses ( gloss ), audio:assets!audio_asset_id ( id, storage_path ) )`,
    )
    .eq("level", level)
    .eq("lexemes.language_code", edition.target)
    .eq("lexemes.lexeme_glosses.base_language", edition.base);
  if (topic) query = query.contains("topics", [topic]);
  const { data, error } = await query.order("position").returns<Row[]>();
  if (error) throw error;
  return data.flatMap((row) => {
    const lexeme = one(row.lexemes);
    return lexeme
      ? [{
          lexemeId: row.lexeme_id, text: lexeme.text, meaning: lexeme.lexeme_glosses[0]?.gloss ?? null,
          audioUrl: assetUrl(lexeme.audio), topics: row.topics ?? [],
        }]
      : [];
  });
}

/** How many phrases a level has in all, also the ones behind Plus (view phrase_counts). */
export async function phraseTotal(target: string, level: string): Promise<number> {
  const { data, error } = await supabase()
    .from("phrase_counts")
    .select("total")
    .eq("language_code", target)
    .eq("level", level)
    .maybeSingle();
  if (error) throw error;
  return data?.total ?? 0;
}

/** Per topic, how many phrases a level has in all, also the ones behind Plus (view phrase_topic_counts). */
export async function topicTotals(target: string, level: string): Promise<Partial<Record<Topic, number>>> {
  const { data, error } = await supabase()
    .from("phrase_topic_counts")
    .select("topic, total")
    .eq("language_code", target)
    .eq("level", level);
  if (error) throw error;
  return Object.fromEntries(data.filter((r) => isTopic(r.topic)).map((r) => [r.topic, r.total]));
}

/** Which phrases of a target language this learner has practised (they are in spaced repetition). */
export async function learnedPhrases(target: string): Promise<Set<string>> {
  const { data, error } = await supabase()
    .from("user_lexeme_state")
    .select("lexeme_id, lexemes!inner ( language_code, phrases!inner ( level ) )")
    .eq("lexemes.language_code", target);
  if (error) throw error;
  return new Set(data.map((r) => r.lexeme_id as string));
}

/** Totals and practised counts per level, for the home page and the phrases page. */
export async function phraseProgress(target: string): Promise<PhraseProgress> {
  const [{ data, error }, learned] = await Promise.all([
    supabase().from("phrases").select("lexeme_id, level, lexemes!inner ( language_code )").eq("lexemes.language_code", target),
    learnedPhrases(target),
  ]);
  if (error) throw error;
  const progress: PhraseProgress = {};
  for (const row of data) {
    const p = (progress[row.level] ??= { total: 0, learned: 0 });
    p.total += 1;
    if (learned.has(row.lexeme_id)) p.learned += 1;
  }
  return progress;
}
