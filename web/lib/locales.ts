import languages from "./languages.json";

/**
 * Every language the app knows, generated from content/languages/*.yaml by `storylingo.py sync` (never edit
 * languages.json by hand). Base languages (with web/dictionaries/<code>.json) can be chosen as the app's language;
 * target languages bring the teacher's phrases and the words the speech recognizer writes differently.
 */
export interface Language {
  name: string; // in the language itself, so a learner finds theirs whatever the page is in
  direction: "ltr" | "rtl";
  script: string; // picks the font (globals.css)
  speechTag: string | null;
  base: boolean;
  target: boolean;
  teacher?: { yes: string[]; no: string[]; next: string; done: string };
  recognition?: Record<string, string>;
}

export const LANGUAGES = languages as Record<string, Language>;

// Which language a page speaks follows from its edition (lib/editions.ts), so there is no language menu.
export const direction = (code: string) => LANGUAGES[code]?.direction ?? "ltr";
export const script = (code: string) => LANGUAGES[code]?.script ?? "latin";
