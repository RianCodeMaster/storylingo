import { type AssetRef, assetUrl, type One, one } from "./assets";
import type { Edition } from "./editions";
import { supabase } from "./supabase";

/** One chunk of the phrases section: the phrase in the target language, its meaning in the base language, its audio. */
export interface PhraseCard {
  lexemeId: string;
  text: string;
  meaning: string | null;
  audioUrl: string | null;
}

/** Per level: how many phrases there are and how many this learner has practised. */
export type PhraseProgress = Record<string, { total: number; learned: number }>;

interface Row {
  lexeme_id: string;
  lexemes: One<{ text: string; lexeme_glosses: { gloss: string }[]; audio: AssetRef }>;
}

/** The phrases of one level in learning order, with meanings in the edition's base language. */
export async function loadPhrases(edition: Edition, level: string): Promise<PhraseCard[]> {
  const { data, error } = await supabase()
    .from("phrases")
    .select(
      `lexeme_id, position,
       lexemes!inner ( text, language_code, lexeme_glosses ( gloss ), audio:assets!audio_asset_id ( id, storage_path ) )`,
    )
    .eq("level", level)
    .eq("lexemes.language_code", edition.target)
    .eq("lexemes.lexeme_glosses.base_language", edition.base)
    .order("position")
    .returns<Row[]>();
  if (error) throw error;
  return data.flatMap((row) => {
    const lexeme = one(row.lexemes);
    return lexeme
      ? [{ lexemeId: row.lexeme_id, text: lexeme.text, meaning: lexeme.lexeme_glosses[0]?.gloss ?? null, audioUrl: assetUrl(lexeme.audio) }]
      : [];
  });
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
