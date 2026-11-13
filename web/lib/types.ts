export type QuestionKind = "yes_no" | "either_or" | "who_what" | "open";

export interface Question {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  answer: string;
  lexeme_id: string | null;
  audio_url: string | null;
}

/** A tappable word: the word comes with the story, its meaning from the learner's base language. */
export interface GlossEntry {
  word: string;
  lemma: string;
  gloss: string | null;
  lexeme_id: string;
}

/** One sentence of a scene's narration: where it starts and ends in the audio, in seconds. */
export interface Sentence {
  text: string;
  start: number;
  end: number;
}

export interface Scene {
  id: string;
  position: number;
  text: string;
  translation: string | null;
  glossary: GlossEntry[];
  image_url: string | null;
  audio_url: string | null;
  sentences: Sentence[]; // empty when the narration has no sentence marks
  questions: Question[];
}

export interface Target {
  id: string;
  text: string;
  gloss: string | null;
  note: string | null; // grammar tip that fits the base language
  emoji: string | null;
  gesture: string | null;
}

/** One of the few words that carry the plot, taught with a picture before the story. */
export interface CoreWord {
  lexeme_id: string;
  text: string;
  gloss: string | null;
  image_url: string | null;
  audio_url: string | null;
}

export interface Story {
  id: string;
  title: string;
  summary: string | null;
  cefr_level: string;
  language_code: string;
  product: string | null; // a pack's story: no daily limit
  targets: Target[];
  words: CoreWord[];
  scenes: Scene[];
}

export interface StoryCard {
  id: string;
  title: string;
  summary: string | null;
  cefr_level: string;
  language_code: string;
  tags: string[];
  free: boolean; // in the free part of its language (lib/plus.ts)
  product: string | null; // the pack it belongs to, if any
  cover: string | null; // the picture of the first scene
}
