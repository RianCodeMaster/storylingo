import { type AssetRef, assetUrl, type One, one } from "./assets";
import type { Edition } from "./editions";
import { supabase } from "./supabase";
import type { CoreWord, GlossEntry, Question, Scene, Sentence, Story, StoryCard, Target } from "./types";

// The story itself is in the target language; everything in the learner's own language comes from the
// *_localizations and lexeme_glosses rows of their base language (docs/meertaligheid.md).

interface SceneRow {
  id: string;
  position: number;
  text: string;
  glossary: Omit<GlossEntry, "gloss">[];
  scene_localizations: { translation: string; glosses: Record<string, string> }[];
  image: AssetRef;
  audio: One<{ id: string; storage_path: string; marks: Sentence[] | null }>;
  questions: (Omit<Question, "audio_url"> & { audio: AssetRef })[];
}

interface Row extends Omit<StoryCard, "summary"> {
  story_localizations: { summary: string | null }[];
  story_targets: {
    lexemes: One<{
      id: string;
      text: string;
      lexeme_glosses: { gloss: string; note: string | null }[];
      concepts: One<{ gestures: One<{ emoji: string | null; gesture_localizations: { description: string }[] }> }>;
    }>;
  }[];
  story_words: {
    lexemes: One<{ id: string; text: string; lexeme_glosses: { gloss: string }[]; image: AssetRef; audio: AssetRef }>;
  }[];
  scenes: SceneRow[];
}

/**
 * The published stories of an edition: its target language, one of its tags and levels, and a layer in its base
 * language. Easiest first, so the first one is where a new learner starts.
 */
export async function listStories(edition: Edition): Promise<StoryCard[]> {
  const { data, error } = await supabase()
    .from("stories")
    .select("id, title, cefr_level, language_code, story_localizations!inner ( summary )")
    .eq("story_localizations.base_language", edition.base)
    .eq("language_code", edition.target)
    .overlaps("tags", edition.stories.tags)
    .in("cefr_level", edition.stories.levels)
    .order("cefr_level")
    .order("published_at")
    .returns<Row[]>();
  if (error) throw error;
  return data.map(({ story_localizations, ...s }) => ({ ...s, summary: story_localizations[0]?.summary ?? null }));
}

/** The stories this learner has played to the end at least once. */
export async function finishedStories(): Promise<Set<string>> {
  const { data, error } = await supabase().from("sessions").select("story_id").not("completed_at", "is", null);
  if (error) throw error;
  return new Set(data.map((s) => s.story_id as string));
}

export async function loadStory(id: string, base: string): Promise<Story> {
  const { data, error } = await supabase()
    .from("stories")
    .select(
      `id, title, cefr_level, language_code,
       story_localizations ( summary ),
       story_targets ( lexemes ( id, text, lexeme_glosses ( gloss, note ),
                                 concepts ( gestures ( emoji, gesture_localizations ( description ) ) ) ) ),
       story_words ( position, lexemes ( id, text, lexeme_glosses ( gloss ),
                                         image:assets!image_asset_id ( id, storage_path ),
                                         audio:assets!audio_asset_id ( id, storage_path ) ) ),
       scenes ( id, position, text, glossary, scene_localizations ( translation, glosses ),
                image:assets!image_asset_id ( id, storage_path ), audio:assets!audio_asset_id ( id, storage_path, marks ),
                questions ( id, position, kind, prompt, options, answer, lexeme_id,
                            audio:assets!audio_asset_id ( id, storage_path ) ) )`,
    )
    .eq("id", id)
    .eq("story_localizations.base_language", base)
    .eq("story_targets.lexemes.lexeme_glosses.base_language", base)
    .eq("story_targets.lexemes.concepts.gestures.gesture_localizations.base_language", base)
    .eq("story_words.lexemes.lexeme_glosses.base_language", base)
    .eq("scenes.scene_localizations.base_language", base)
    .eq("scenes.questions.retired", false) // removed from story.yaml after learners answered them
    .order("position", { referencedTable: "story_words" })
    .order("position", { referencedTable: "scenes" })
    .order("position", { referencedTable: "scenes.questions" })
    .single<Row>();
  if (error) throw error;

  const targets: Target[] = data.story_targets
    .map((st) => one(st.lexemes))
    .filter((l) => l !== null)
    .map((l) => {
      const gesture = one(one(l.concepts)?.gestures ?? null);
      const meaning = l.lexeme_glosses[0];
      return {
        id: l.id,
        text: l.text,
        gloss: meaning?.gloss ?? null,
        note: meaning?.note ?? null,
        emoji: gesture?.emoji ?? null,
        gesture: gesture?.gesture_localizations[0]?.description ?? null,
      };
    });

  const scenes: Scene[] = data.scenes.map(({ image, audio, questions, glossary, scene_localizations, ...scene }) => {
    const local = scene_localizations[0];
    return {
      ...scene,
      translation: local?.translation ?? null,
      glossary: glossary.map((e) => ({ ...e, gloss: local?.glosses[e.word] ?? null })),
      image_url: assetUrl(image),
      audio_url: assetUrl(audio),
      sentences: one(audio)?.marks ?? [],
      questions: questions.map(({ audio: qAudio, ...q }) => ({ ...q, audio_url: assetUrl(qAudio) })),
    };
  });

  const words: CoreWord[] = data.story_words
    .map((sw) => one(sw.lexemes))
    .filter((l) => l !== null)
    .map((l) => ({
      lexeme_id: l.id,
      text: l.text,
      gloss: l.lexeme_glosses[0]?.gloss ?? null,
      image_url: assetUrl(l.image),
      audio_url: assetUrl(l.audio),
    }));

  const { id: storyId, title, cefr_level, language_code } = data;
  const summary = data.story_localizations[0]?.summary ?? null;
  return { id: storyId, title, cefr_level, language_code, summary, targets, words, scenes };
}

/** A play session, in the edition it happened in (a story can be in several editions). */
export async function startSession(userId: string, storyId: string, edition: string): Promise<string> {
  const { data, error } = await supabase()
    .from("sessions")
    .insert({ user_id: userId, story_id: storyId, edition })
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
export type Results = Map<string, { seen: number; correct: number }>;

export async function finishSession(sessionId: string, userId: string, results: Results) {
  const { error } = await supabase().from("sessions").update({ completed_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw error;
  await saveResults(userId, results);
}

/**
 * Practice results (lexeme -> times seen and right) into spaced repetition: everything right pushes the next review
 * further away, a mistake brings it back tomorrow. Shared by stories and the phrases section.
 */
export async function saveResults(userId: string, results: Results) {
  if (results.size === 0) return;
  const sb = supabase();

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
