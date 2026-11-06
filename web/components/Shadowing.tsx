"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { canListen, listen, wordsHeard } from "@/lib/listen";
import { canRecord, record, type Recording } from "@/lib/record";
import { playPart, stopSpeaking } from "@/lib/speech";
import type { Sentence, Story } from "@/lib/types";

export type ShadowLine = Sentence & { audioUrl: string };

const MAX_LINES = 6;
const MAX_WORDS = 12;

/**
 * The sentences to repeat, in story order: every target structure at least once, then one per scene, then more
 * sentences with a target. Empty when the narration has no sentence marks (then the story skips this step).
 */
export function pickLines(story: Story): ShadowLine[] {
  const targets = story.targets.map((t) => t.text.toLowerCase());
  const all = story.scenes.flatMap((scene, s) =>
    scene.audio_url ? scene.sentences.map((line, i) => ({ ...line, audioUrl: scene.audio_url!, s, i })) : [],
  );
  type Line = (typeof all)[number];
  const has = (line: Line, target: string) => line.text.toLowerCase().includes(target);
  const carries = (line: Line) => targets.some((t) => has(line, t));
  // A sentence you can say in one breath. A long one only when it is the only sentence with that target.
  const short = all.filter((line) => carries(line) && line.text.split(/\s+/).length <= MAX_WORDS);
  const picked = new Set<Line>();
  for (const target of targets) {
    if (![...picked].some((line) => has(line, target))) {
      const first = short.find((line) => has(line, target)) ?? all.find((line) => has(line, target));
      if (first && picked.size < MAX_LINES) picked.add(first);
    }
  }
  for (let s = 0; s < story.scenes.length && picked.size < MAX_LINES; s++) {
    if ([...picked].some((line) => line.s === s)) continue;
    const first = short.find((line) => line.s === s);
    if (first) picked.add(first);
  }
  for (const line of short) if (picked.size < MAX_LINES) picked.add(line);
  return all.filter((line) => picked.has(line)).map(({ text, start, end, audioUrl }) => ({ text, start, end, audioUrl }));
}

/**
 * Shadowing: hear one sentence, say it straight after in the same rhythm and melody, then hear yourself next to
 * the narrator. The recognizer shows which words came across clearly. All in the browser: no AI, no upload.
 */
export default function Shadowing({ lines, lang, onDone }: { lines: ShadowLine[]; lang: string; onDone: () => void }) {
  const { dict, fill } = useI18n();
  const [i, setI] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [heard, setHeard] = useState<boolean[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [mic, setMic] = useState(false);
  const own = useRef<HTMLAudioElement | null>(null);
  const line = lines[i];
  const words = line.text.split(/\s+/).filter(Boolean);

  // Known only in the browser, so read after the first render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
    setMic(canRecord());
  }, []);

  // Every new sentence is heard first.
  useEffect(() => {
    playPart(line.audioUrl, line.start, line.end);
    return stopSpeaking;
  }, [line]);

  // A recording lives only as long as its sentence is on screen.
  useEffect(() => () => void (mine && URL.revokeObjectURL(mine)), [mine]);

  async function start() {
    stopSpeaking();
    setHeard(null);
    setMine(null);
    try {
      // Room for a slower learner: the narrator's length and a half, plus a moment to begin.
      const r = await record((line.end - line.start) * 1500 + 1500);
      setRecording(r);
      if (canListen()) listen(lang, (alternatives) => setHeard(wordsHeard(line.text, alternatives, lang)), () => {});
      const url = await r.done;
      setRecording(null);
      setMine(url);
      playMine(url);
    } catch {
      setRecording(null);
      setBlocked(true);
    }
  }

  // Yourself first, then the narrator once more: the difference is easiest to hear right after each other.
  function playMine(url = mine) {
    if (!url) return;
    stopSpeaking();
    own.current?.pause();
    own.current = new Audio(url);
    own.current.onended = () => playPart(line.audioUrl, line.start, line.end);
    own.current.play().catch(() => {});
  }

  function next() {
    recording?.stop();
    own.current?.pause();
    setMine(null);
    setHeard(null);
    if (i + 1 < lines.length) setI(i + 1);
    else onDone();
  }

  return (
    <>
      <span className="badge">{fill(dict.shadow.progress, { n: i + 1, total: lines.length })}</span>
      <p className="muted">{mic && !blocked ? dict.shadow.hint : dict.shadow.sayAloud}</p>
      <div className="card">
        <p className="story-text">
          {words.map((word, w) => (
            <span key={w} className={heard ? (heard[w] ? "heard" : "missed") : undefined}>
              {word}{" "}
            </span>
          ))}
        </p>
        <div className="row">
          <button onClick={() => playPart(line.audioUrl, line.start, line.end)}>{dict.shadow.listen}</button>
          {mic && !blocked && (
            <button className={`mic ${recording ? "listening" : ""}`} onClick={recording ? recording.stop : start}>
              {recording ? dict.shadow.stop : dict.shadow.record}
            </button>
          )}
          {mine && <button onClick={() => playMine()}>{dict.shadow.mine}</button>}
        </div>
      </div>
      {heard && <p className="muted">{fill(dict.shadow.heard, { n: heard.filter(Boolean).length, total: words.length })}</p>}
      {blocked && <p className="muted">{dict.story.micBlocked}</p>}
      <button className="primary" onClick={next}>
        {i + 1 < lines.length ? dict.shadow.next : dict.shadow.finish}
      </button>
      <button className="link muted" onClick={onDone}>
        {dict.shadow.skip}
      </button>
    </>
  );
}
