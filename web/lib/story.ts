import { supabase } from "./supabase";
import type { Question, Scene, Story, Target } from "./types";

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type AssetRef = One<{ id: string; storage_path: string }>;

/**
 * Public URL of a generated file, through the same /sb route the rest of the app uses.
 * The asset id is added as a version: a remade file keeps its path, and browsers cache files for an hour.
 */
function assetUrl(ref: AssetRef): string | null {
  const asset = one(ref);
  return asset ? `${window.location.origin}/sb/storage/v1/object/public/assets/${asset.storage_path}?v=${asset.id}` : null;
}

interface SceneRow extends Omit<Scene, "image_url" | "audio_url" | "questions"> {
  image: AssetRef;
  audio: AssetRef;
  questions: (Omit<Question, "audio_url"> & { audio: AssetRef })[];
}

interface Row {
  id: string;
  title: string;
  summary: string | null;
  cefr_level: string;
  language_code: string;
  story_targets: {
    lexemes: One<{
      id: string;
      text: string;
      gloss: string | null;
      concepts: One<{ gestures: One<{ description: string; emoji: string | null }> }>;
    }>;
  }[];
  scenes: SceneRow[];
}

export async function loadStory(id: string): Promise<Story> {
  const { data, error } = await supabase()
    .from("stories")
    .select(
      `id, title, summary, cefr_level, language_code,
       story_targets ( lexemes ( id, text, gloss, concepts ( gestures ( description, emoji ) ) ) ),
       scenes ( id, position, text, translation, glossary,
                image:assets!image_asset_id ( id, storage_path ), audio:assets!audio_asset_id ( id, storage_path ),
                questions ( id, position, kind, prompt, options, answer, lexeme_id,
                            audio:assets!audio_asset_id ( id, storage_path ) ) )`,
    )
    .eq("id", id)
    .order("position", { referencedTable: "scenes" })
    .order("position", { referencedTable: "scenes.questions" })
    .single<Row>();
  if (error) throw error;

  const targets: Target[] = data.story_targets
    .map((st) => one(st.lexemes))
    .filter((l) => l !== null)
    .map((l) => {
      const gesture = one(one(l.concepts)?.gestures ?? null);
      return { id: l.id, text: l.text, gloss: l.gloss, emoji: gesture?.emoji ?? null, gesture: gesture?.description ?? null };
    });

  const scenes: Scene[] = data.scenes.map(({ image, audio, questions, ...scene }) => ({
    ...scene,
    image_url: assetUrl(image),
    audio_url: assetUrl(audio),
    questions: questions.map(({ audio: qAudio, ...q }) => ({ ...q, audio_url: assetUrl(qAudio) })),
  }));

  return { ...data, targets, scenes };
}

export async function startSession(userId: string, storyId: string): Promise<string> {
  const { data, error } = await supabase()
    .from("sessions")
    .insert({ user_id: userId, story_id: storyId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function recordAnswer(sessionId: string, questionId: string, given: string, isCorrect: boolean, responseMs: number) {
  const { error } = await supabase()
    .from("answers")
    .insert({ session_id: sessionId, question_id: questionId, given, is_correct: isCorrect, response_ms: responseMs });
  if (error) throw error;
}

/**
 * A tapped word is a word the learner does not know yet: log it and schedule it for review tomorrow.
 */
export async function recordLookup(userId: string, lexemeId: string, sceneId: string, sessionId: string | null) {
  const sb = supabase();
  const { error } = await sb
    .from("word_lookups")
    .insert({ user_id: userId, lexeme_id: lexemeId, scene_id: sceneId, session_id: sessionId });
  if (error) throw error;

  const { data: prev, error: readError } = await sb
    .from("user_lexeme_state")
    .select("exposures, correct, ease")
    .eq("lexeme_id", lexemeId)
    .maybeSingle();
  if (readError) throw readError;
  const { error: writeError } = await sb.from("user_lexeme_state").upsert({
    user_id: userId,
    lexeme_id: lexemeId,
    exposures: (prev?.exposures ?? 0) + 1,
    correct: prev?.correct ?? 0,
    ease: prev?.ease ?? 2.5,
    interval_days: 1,
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (writeError) throw writeError;
}

/**
 * Close the session and update spaced-repetition state per practised structure.
 * All correct in this session: the next review moves further away. Any mistake: review again tomorrow.
 */
export async function finishSession(sessionId: string, userId: string, results: Map<string, { seen: number; correct: number }>) {
  const sb = supabase();
  const { error } = await sb.from("sessions").update({ completed_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw error;
  if (results.size === 0) return;

  const ids = [...results.keys()];
  const { data: existing, error: readError } = await sb
    .from("user_lexeme_state")
    .select("lexeme_id, exposures, correct, ease, interval_days")
    .in("lexeme_id", ids);
  if (readError) throw readError;
  const byId = new Map(existing.map((r) => [r.lexeme_id, r]));

  const DAY = 24 * 60 * 60 * 1000;
  const rows = ids.map((lexemeId) => {
    const r = results.get(lexemeId)!;
    const prev = byId.get(lexemeId) ?? { exposures: 0, correct: 0, ease: 2.5, interval_days: 0 };
    const perfect = r.correct === r.seen;
    const ease = perfect ? Number(prev.ease) : Math.max(1.3, Number(prev.ease) - 0.2);
    const interval = perfect ? Math.max(1, Math.round(prev.interval_days * ease)) : 1;
    return {
      user_id: userId,
      lexeme_id: lexemeId,
      exposures: prev.exposures + r.seen,
      correct: prev.correct + r.correct,
      ease,
      interval_days: interval,
      due_at: new Date(Date.now() + interval * DAY).toISOString(),
    };
  });
  const { error: writeError } = await sb.from("user_lexeme_state").upsert(rows);
  if (writeError) throw writeError;
}
