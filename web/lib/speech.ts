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

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  player?.pause();
}
