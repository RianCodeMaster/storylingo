"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { feedback, narrate, PHRASES, stopSpeaking } from "@/lib/speech";
import type { CoreWord } from "@/lib/types";

export type WordResults = Map<string, { seen: number; correct: number }>;

type Step =
  | { kind: "learn"; i: number }
  | { kind: "game"; queue: number[]; options: number[]; picked: number | null };

/** Four pictures for a round: the word itself and three others from the story, in random order. */
function optionsFor(answer: number, count: number): number[] {
  const others = [...Array(count).keys()].filter((i) => i !== answer).sort(() => Math.random() - 0.5).slice(0, 3);
  return [answer, ...others].sort(() => Math.random() - 0.5);
}

/**
 * Before the story: the core words one by one (picture, voice, meaning), then a listening game where the
 * learner hears a word and taps its picture. Meaning first, then the story: like a TPRS teacher who
 * establishes the words before telling.
 */
export default function WordsIntro({
  title,
  words,
  lang,
  onDone,
}: {
  title: string;
  words: CoreWord[];
  lang: string;
  onDone: (results: WordResults) => void;
}) {
  const { dict, fill } = useI18n();
  const [step, setStep] = useState<Step>({ kind: "learn", i: 0 });
  const [results] = useState<WordResults>(() => new Map());
  const [repeated] = useState(() => new Set<number>());
  const [firstTry, setFirstTry] = useState(0);
  const current = step.kind === "learn" ? words[step.i] : words[step.queue[0]];

  // Every word is heard as it appears: the sound comes before the meaning.
  useEffect(() => {
    if (current && (step.kind === "learn" || step.picked === null)) narrate(current.audio_url, current.text, lang);
    return stopSpeaking;
  }, [current, step, lang]);

  function startGame() {
    const queue = [...words.keys()].sort(() => Math.random() - 0.5);
    setStep({ kind: "game", queue, options: optionsFor(queue[0], words.length), picked: null });
  }

  function pick(option: number) {
    if (step.kind !== "game" || step.picked !== null) return;
    const answer = step.queue[0];
    const correct = option === answer;
    const word = words[answer];
    const r = results.get(word.lexeme_id) ?? { seen: 0, correct: 0 };
    results.set(word.lexeme_id, { seen: r.seen + 1, correct: r.correct + (correct ? 1 : 0) });
    if (correct && !repeated.has(answer)) setFirstTry((n) => n + 1);
    feedback(correct, lang);
    setStep({ ...step, picked: option });
    if (correct) setTimeout(() => advance(step.queue, false), 1200);
  }

  function advance(queue: number[], again: boolean) {
    // A word you missed comes back once at the end of the game.
    const answer = queue[0];
    const back = again && !repeated.has(answer);
    if (again) repeated.add(answer);
    const rest = back ? [...queue.slice(1), answer] : queue.slice(1);
    if (rest.length === 0) return onDone(results);
    setStep({ kind: "game", queue: rest, options: optionsFor(rest[0], words.length), picked: null });
  }

  if (step.kind === "learn") {
    const word = words[step.i];
    const last = step.i === words.length - 1;
    return (
      <>
        <h1 dir="ltr">{title}</h1>
        <span className="badge">{fill(dict.words.progress, { n: step.i + 1, total: words.length })}</span>
        <p className="muted">{dict.words.hint}</p>
        <div className="card word-card">
          {word.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
            <img className="word-picture" src={word.image_url} alt="" />
          )}
          <p className="review-word" dir="ltr">{word.text}</p>
          {word.gloss && <p className="sheet-gloss">{word.gloss}</p>}
          <button onClick={() => narrate(word.audio_url, word.text, lang)}>{dict.common.again}</button>
        </div>
        <button className="primary" onClick={() => (last ? startGame() : setStep({ kind: "learn", i: step.i + 1 }))}>
          {last ? dict.words.toGame : dict.words.next}
        </button>
      </>
    );
  }

  const answer = step.queue[0];
  const missed = step.picked !== null && step.picked !== answer;
  return (
    <>
      <span className="badge">{dict.words.game}</span>
      <div className="row">
        <button onClick={() => narrate(words[answer].audio_url, words[answer].text, lang)}>{dict.common.again}</button>
        {step.picked !== null && <p className="big-feedback" dir="ltr">{words[answer].text}</p>}
      </div>
      <div className="pictures">
        {step.options.map((option) => (
          <button
            key={option}
            aria-label={words[option].gloss ?? words[option].text}
            className={`${step.picked !== null && option === answer ? "correct" : ""} ${step.picked === option && option !== answer ? "wrong" : ""}`}
            disabled={step.picked !== null}
            onClick={() => pick(option)}
          >
            {words[option].image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
              <img src={words[option].image_url!} alt="" />
            ) : (
              words[option].gloss
            )}
          </button>
        ))}
      </div>
      {missed && (
        <button className="primary" onClick={() => advance(step.queue, true)}>
          {PHRASES[lang].next} <span className="arrow">→</span>
        </button>
      )}
      <p className="muted">{fill(dict.words.score, { correct: firstTry, total: words.length })}</p>
    </>
  );
}
