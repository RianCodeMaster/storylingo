/**
 * Phase 1 voice: the browser's own speech engine (free, no API key).
 * Later the pipeline produces expressive audio files and this becomes the fallback.
 */

const LANG_TAGS: Record<string, string> = { de: "de-DE", nl: "nl-NL", es: "es-ES", fr: "fr-FR", en: "en-US" };

function pickVoice(tag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(tag));
  // Online "natural" voices sound far less robotic than the built-in ones.
  return voices.find((v) => /natural|online|google/i.test(v.name)) ?? voices[0];
}

export function speak(text: string, language: string, mood: "story" | "cheer" | "oops" = "story") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  player?.pause();
  const tag = LANG_TAGS[language] ?? language;
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
  synth.speak(utterance);
}

let player: HTMLAudioElement | null = null;

/** Play the generated narration when there is one; otherwise fall back to the browser voice. */
export function narrate(audioUrl: string | null, text: string, language: string) {
  stopSpeaking();
  if (!audioUrl) return speak(text, language);
  player ??= new Audio();
  player.src = audioUrl;
  player.play().catch(() => speak(text, language));
}

/**
 * The teacher's own words in the target language: the story stays immersive whatever the learner's base language.
 * yes/no are spoken once per language by the pipeline (storylingo.py feedback <lang>); counts match FEEDBACK there.
 */
export const PHRASES: Record<string, { yes: string[]; no: string[]; next: string; done: string }> = {
  de: {
    yes: ["Ja! Genau!", "Richtig! Super!", "Fantastisch!", "Ja, ja, ja!"],
    no: ["Nein, nein, nein!", "Oh nein!"],
    next: "Weiter",
    done: "Fertig!",
  },
};

// Raise when the clips are made again (storylingo.py feedback), so browsers fetch the new files.
const FEEDBACK_VERSION = 3;

/** React to an answer in the story's native voice; the browser voice only if the clip is missing. Returns the line. */
export function feedback(correct: boolean, language: string): string {
  const lines = correct ? PHRASES[language].yes : PHRASES[language].no;
  const n = Math.floor(Math.random() * lines.length);
  const url = `${window.location.origin}/sb/storage/v1/object/public/assets/feedback/${language}/${correct ? "yes" : "no"}-${n + 1}.wav?v=${FEEDBACK_VERSION}`;
  stopSpeaking();
  player ??= new Audio();
  player.src = url;
  player.play().catch(() => speak(lines[n], language, correct ? "cheer" : "oops"));
  return lines[n];
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  player?.pause();
}
