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

export interface Scene {
  id: string;
  position: number;
  text: string;
  translation: string | null;
  glossary: GlossEntry[];
  image_url: string | null;
  audio_url: string | null;
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

export interface Story {
  id: string;
  title: string;
  summary: string | null;
  cefr_level: string;
  language_code: string;
  targets: Target[];
  scenes: Scene[];
}

export interface StoryCard {
  id: string;
  title: string;
  summary: string | null;
  cefr_level: string;
  language_code: string;
}
