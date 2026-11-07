/**
 * Phase 1 voice: the browser's own speech engine (free, no API key).
 * Later the pipeline produces expressive audio files and this becomes the fallback.
 */
import { LANGUAGES } from "./locales";
import { publicFile } from "./supabase";

/** The speech code of a language (de-DE), from its language file. */
export const speechTag = (language: string) => LANGUAGES[language]?.speechTag ?? language;

function pickVoice(tag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(tag));
  // Online "natural" voices sound far less robotic than the built-in ones.
  return voices.find((v) => /natural|online|google/i.test(v.name)) ?? voices[0];
}

export function speak(text: string, language: string, mood: "story" | "cheer" | "oops" = "story", onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  player?.pause();
  const tag = speechTag(language);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tag;
  const voice = pickVoice(tag);
  if (voice) utterance.voice = voice;
  // TPRS is theatre: slow and clear for the story, big and bright for feedback.
  if (mood === "story") {
    utterance.rate = 0.85;
  } else if (mood === "cheer") {
    utterance.rate = 1.05;
    utterance.pitch = 1.4;
  } else {
    utterance.rate = 0.9;
    utterance.pitch = 0.7;
  }
  if (onEnd) utterance.onend = onEnd;
  synth.speak(utterance);
}

let player: HTMLAudioElement | null = null;

/**
 * Play the generated narration when there is one; otherwise fall back to the browser voice.
 * `onEnd` runs when it finished playing, not when it was stopped (used to start listening for an answer).
 */
export function narrate(audioUrl: string | null, text: string, language: string, onEnd?: () => void) {
  stopSpeaking();
  if (!audioUrl) return speak(text, language, "story", onEnd);
  player ??= new Audio();
  player.onended = onEnd ?? null;
  player.src = audioUrl;
  player.play().catch(() => speak(text, language, "story", onEnd));
}

/**
 * The teacher's own words in the target language (teacher: in content/languages/<code>.yaml): the story stays
 * immersive whatever the learner's base language. yes/no are spoken once per language by the pipeline
 * (storylingo.py feedback <lang>), in the same order.
 */
export const phrases = (language: string) => LANGUAGES[language].teacher!;

// Raise when the clips are made again (storylingo.py feedback), so browsers fetch the new files.
const FEEDBACK_VERSION = 4;

/** React to an answer in the story's native voice; the browser voice only if the clip is missing. Returns the line. */
export function feedback(correct: boolean, language: string): string {
  const lines = correct ? phrases(language).yes : phrases(language).no;
  const n = Math.floor(Math.random() * lines.length);
  const url = `${publicFile(`feedback/${language}/${correct ? "yes" : "no"}-${n + 1}.mp3`)}?v=${FEEDBACK_VERSION}`;
  stopSpeaking();
  player ??= new Audio();
  player.onended = null;
  player.src = url;
  player.play().catch(() => speak(lines[n], language, correct ? "cheer" : "oops"));
  return lines[n];
}

/** Play one sentence out of a scene's narration (start and end in seconds), for the learner to repeat. */
export function playPart(audioUrl: string, start: number, end: number, onEnd?: () => void) {
  stopSpeaking();
  player ??= new Audio();
  const p = player;
  p.onended = null;
  const go = () => {
    p.currentTime = start;
    p.ontimeupdate = () => {
      if (p.currentTime < end) return;
      p.pause();
      p.ontimeupdate = null;
      onEnd?.();
    };
    p.play().catch(() => {});
  };
  if (p.src === audioUrl && p.readyState >= 1) return go();
  p.onloadedmetadata = () => {
    p.onloadedmetadata = null;
    go();
  };
  p.src = audioUrl;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (!player) return;
  player.pause();
  player.ontimeupdate = null;
  player.onloadedmetadata = null;
}
