/**
 * Answering out loud: the browser's own speech recognition (free, no API key, no LLM). It only has to decide which
 * of the three or four known answers the learner said, so a rough transcript is enough.
 */

import { LANG_TAGS } from "./speech";

// Not in every TypeScript DOM library yet: only the part this file uses.
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognizer(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

/** Chrome, Edge and Safari can; Firefox cannot. The microphone also needs https or localhost. */
export function canListen(): boolean {
  return recognizer() !== null && window.isSecureContext;
}

export type ListenError = "blocked" | "failed" | null;

/** Calling it stops listening at once, without a result; `finish()` stops gracefully: the result still comes. */
export type StopListening = (() => void) & { finish: () => void };

/**
 * Listen for one answer. `onHeard` gets every alternative the recognizer offers (best first), or none when it heard
 * nothing; `onEnd` comes last, with an error when listening was impossible. The microphone is free after `onEnd`.
 */
export function listen(
  language: string,
  onHeard: (alternatives: string[]) => void,
  onEnd: (error: ListenError) => void,
): StopListening {
  const Recognizer = recognizer();
  if (!Recognizer) {
    onEnd("failed");
    return Object.assign(() => {}, { finish: () => {} });
  }
  const r = new Recognizer();
  r.lang = LANG_TAGS[language] ?? language;
  r.interimResults = false;
  r.maxAlternatives = 5;
  let heard = false;
  let error: ListenError = null;
  r.onresult = (e) => {
    heard = true;
    onHeard(Array.from(e.results[0] ?? [], (a) => a.transcript));
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") error = "blocked";
    else if (e.error !== "no-speech" && e.error !== "aborted") error = "failed";
  };
  r.onend = () => {
    if (!heard && !error) onHeard([]);
    onEnd(error);
  };
  r.start();
  const stop = () => {
    r.onresult = null;
    r.onend = null;
    r.abort();
  };
  return Object.assign(stop, { finish: () => r.stop() });
}

// Recognizers write numbers as digits ("1000"), stories often as words ("Tausend"), and learners say "nee" for "nein".
const WORDS: Record<string, Record<string, string>> = {
  de: {
    eins: "1", zwei: "2", drei: "3", vier: "4", funf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9", zehn: "10",
    elf: "11", zwolf: "12", zwanzig: "20", hundert: "100", einhundert: "100", tausend: "1000", eintausend: "1000",
    nee: "nein", no: "nein", jo: "ja", jawohl: "ja",
  },
};

function words(text: string, language: string): string[] {
  const map = WORDS[language] ?? {};
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => map[w] ?? w);
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// A recognizer often gets one letter wrong in a longer word ("Kafig", "Bananenschalen"). Numbers must be exact.
function same(heard: string, word: string): boolean {
  if (heard === word) return true;
  if (/\d/.test(word)) return false;
  if (word.length >= 7) return distance(heard, word) <= 2;
  return word.length >= 4 && distance(heard, word) <= 1;
}

/**
 * Which option did the learner say? Only the words that tell the options apart count ("in einem Käfig" vs
 * "in einem Haus" is decided by Käfig/Haus), so "Käfig" alone or a whole sentence both work. Returns null when
 * nothing fits or two options fit equally well; the learner then says it again or taps.
 * Ties are broken by exact words ("online" is one letter from "offline") and then by how many of the option's
 * words were heard ("nicht schlafen" vs "schlafen").
 */
export function matchAnswer(alternatives: string[], options: string[], language: string): string | null {
  const optionWords = options.map((o) => words(o, language));
  const shared = optionWords.reduce((common, ws) => common.filter((w) => ws.includes(w)));
  const scores = optionWords.map((ws) => {
    const distinct = ws.filter((w) => !shared.includes(w));
    const key = distinct.length ? distinct : ws;
    let best = [0, 0, 0];
    for (const alternative of alternatives) {
      const heard = words(alternative, language);
      // "HILDE123" is heard as "Hilde 123": codes with digits are compared without spaces as well.
      const code = /\d/.test(key.join("")) && /\p{L}/u.test(key.join("")) && heard.join("").includes(key.join(""));
      const score = [
        code ? 1 : key.filter((w) => heard.some((h) => same(h, w))).length / key.length,
        key.filter((w) => heard.includes(w)).length,
        ws.filter((w) => heard.includes(w)).length,
      ];
      if (compare(score, best) > 0) best = score;
    }
    return best;
  });
  const top = scores.reduce((a, b) => (compare(a, b) >= 0 ? a : b));
  if (top[0] < 0.3 || scores.filter((s) => compare(s, top) === 0).length > 1) return null;
  return options[scores.indexOf(top)];
}

/**
 * Shadowing: which words of the sentence did the recognizer hear? One flag per word of `sentence.split(" ")`,
 * from the alternative that heard the most. A rough mirror of how clear the learner was, not a grade.
 */
export function wordsHeard(sentence: string, alternatives: string[], language: string): boolean[] {
  const parts = sentence.split(/\s+/).filter(Boolean);
  let best = parts.map(() => false);
  for (const alternative of alternatives) {
    const heard = words(alternative, language);
    const flags = parts.map((part) => words(part, language).every((w) => heard.some((h) => same(h, w))));
    if (flags.filter(Boolean).length > best.filter(Boolean).length) best = flags;
  }
  return best;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
