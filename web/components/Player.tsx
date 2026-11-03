"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { advance, Circling, start } from "@/lib/circling";
import { feedback, narrate, speak, stopSpeaking } from "@/lib/speech";
import { finishSession, recordAnswer, recordLookup, startSession } from "@/lib/story";
import type { GlossEntry, Question, Story, Target } from "@/lib/types";
import InteractiveText, { WordSheet, type Tapped } from "./InteractiveText";

type Phase =
  | { kind: "intro" }
  | { kind: "scene"; s: number }
  | { kind: "question"; s: number; queue: number[] } // queue[0] is the question being asked
  | { kind: "done" };


function QuestionView(props: {
  label: string;
  question: Question;
  targets: Target[];
  words: Map<string, GlossEntry>;
  onTap: (t: Tapped) => void;
  lang: string;
  picked: string | null;
  onAnswer: (option: string) => void;
  onNext: () => void;
}) {
  const { question, picked } = props;
  return (
    <>
      <span className="badge">{props.label}</span>
      <div className="card">
        <p className="story-text">
          <InteractiveText text={question.prompt} targets={props.targets} words={props.words} onTap={props.onTap} />
        </p>
        <button onClick={() => narrate(question.audio_url, question.prompt, props.lang)}>🔊 Nog een keer</button>
      </div>
      <div className="row">
        {question.options.map((option) => (
          <button
            key={option}
            className={`option ${picked && option === question.answer ? "correct" : ""} ${
              picked === option && option !== question.answer ? "wrong" : ""
            }`}
            disabled={picked !== null}
            onClick={() => props.onAnswer(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {picked && (
        <>
          <p className="big-feedback">{picked === question.answer ? "Ja! Genau! 🎉" : `Nein! ${question.answer}`}</p>
          <button className="primary" onClick={props.onNext}>
            Weiter →
          </button>
        </>
      )}
    </>
  );
}

export default function Player({ story, userId }: { story: Story; userId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  // A session starts when the learner presses "Begin", so just opening a story leaves no empty sessions.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [tapped, setTapped] = useState<Tapped | null>(null);
  const [lookups, setLookups] = useState(0);
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const askedAt = useRef(0);
  const results = useRef(new Map<string, { seen: number; correct: number }>());
  const lookedUp = useRef(new Set<string>());
  const circling = useRef(new Circling());
  const repeated = useRef(new Set<string>()); // questions already sent back once after a wrong answer
  const circleBack = useRef(false);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang = story.language_code;

  // Every glossary word of the story, so words in questions are tappable too.
  const [words] = useState(() => {
    const map = new Map<string, GlossEntry>();
    for (const scene of story.scenes) for (const e of scene.glossary ?? []) if (!map.has(e.word.toLowerCase())) map.set(e.word.toLowerCase(), e);
    return map;
  });

  function tap(t: Tapped) {
    setTapped(t);
    speak(t.lemma, lang);
    // Log each word once per story: one tap is enough to know it still needs practice.
    if (lookedUp.current.has(t.lexemeId)) return;
    lookedUp.current.add(t.lexemeId);
    setLookups((n) => n + 1);
    const sceneId = phase.kind === "scene" || phase.kind === "question" ? story.scenes[phase.s].id : story.scenes[0].id;
    recordLookup(userId, t.lexemeId, sceneId, sessionId).catch((e) => setError(e.message));
  }

  // Progress by scene: with skipped and repeated questions, a question count would jump around.
  const scenes = story.scenes.length;
  const progress =
    phase.kind === "done" ? 1
    : phase.kind === "scene" ? phase.s / scenes
    : phase.kind === "question" ? (phase.s + 1 - phase.queue.length / (story.scenes[phase.s].questions.length + 1)) / scenes
    : 0;

  // Tell each scene and ask each question automatically, like a teacher in front of the class.
  useEffect(() => {
    if (phase.kind === "scene") {
      const scene = story.scenes[phase.s];
      narrate(scene.audio_url, scene.text, lang);
    }
    if (phase.kind === "question") {
      askedAt.current = Date.now();
      const question = story.scenes[phase.s].questions[phase.queue[0]];
      narrate(question.audio_url, question.prompt, lang);
    }
    return stopSpeaking;
  }, [phase, story, lang]);

  function answer(option: string) {
    if (phase.kind !== "question" || picked) return;
    const question = story.scenes[phase.s].questions[phase.queue[0]];
    const correct = option === question.answer;
    const responseMs = Date.now() - askedAt.current;
    setPicked(option);
    circling.current.record(question.lexeme_id, correct, responseMs);
    // Circle back: the same question once more at the end of this scene (added when moving on).
    circleBack.current = !correct && !repeated.current.has(question.id);
    if (circleBack.current) repeated.current.add(question.id);
    // Keep the pace up: after a right answer, move on by itself.
    if (correct) autoNext.current = setTimeout(() => nextRef.current(), 1600);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    feedback(correct, lang);
    if (question.lexeme_id) {
      const r = results.current.get(question.lexeme_id) ?? { seen: 0, correct: 0 };
      results.current.set(question.lexeme_id, { seen: r.seen + 1, correct: r.correct + (correct ? 1 : 0) });
    }
    if (sessionId) {
      recordAnswer(sessionId, question.id, option, correct, responseMs).catch((e) => setError(e.message));
    }
  }

  function noteSkipped(lexemeIds: string[]) {
    const names = lexemeIds.map((id) => story.targets.find((t) => t.id === id)?.text).filter(Boolean);
    if (names.length) setSkipNote(`✓ ${names.join(", ")} zit erin: die vragen sla ik over.`);
  }

  function next() {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = null;
    setPicked(null);
    setShowTranslation(false);
    setTapped(null);
    setSkipNote(null);
    if (phase.kind === "intro") {
      startSession(userId, story.id).then(setSessionId).catch((e) => setError(e.message));
      return setPhase({ kind: "scene", s: 0 });
    }
    const questions = phase.kind === "done" ? [] : story.scenes[phase.s].questions;
    if (phase.kind === "scene") {
      const { queue, skipped } = start(questions, circling.current);
      noteSkipped(skipped);
      if (queue.length) return setPhase({ kind: "question", s: phase.s, queue });
    } else if (phase.kind === "question") {
      const current = circleBack.current ? [...phase.queue, phase.queue[0]] : phase.queue;
      circleBack.current = false;
      const { queue, skipped } = advance(current, questions, circling.current);
      noteSkipped(skipped);
      if (queue.length) return setPhase({ ...phase, queue });
    } else {
      return;
    }
    if (phase.s + 1 < story.scenes.length) return setPhase({ kind: "scene", s: phase.s + 1 });
    setPhase({ kind: "done" });
    if (sessionId) finishSession(sessionId, userId, results.current).catch((e) => setError(e.message));
  }

  // The auto-advance timer must call the latest next(), not the one from the render that started it.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });

  return (
    <main>
      <div className="progress">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      {error && <p className="card">Opslaan mislukt: {error}</p>}
      {skipNote && <p className="skip-note">{skipNote}</p>}

      {phase.kind === "intro" && (
        <>
          <h1>{story.title}</h1>
          <p className="muted">Eerst de gebaren. Doe ze echt na, groot en overdreven: je lichaam onthoudt mee.</p>
          {story.targets.map((t) => (
            <div key={t.id} className="card gesture">
              <span className="emoji">{t.emoji ?? "✋"}</span>
              <div>
                <strong>
                  {t.text} = {t.gloss}
                </strong>
                {t.gesture && <p className="muted">{t.gesture}</p>}
              </div>
              <button aria-label={`Spreek ${t.text} uit`} onClick={() => speak(t.text, lang, "cheer")}>
                🔊
              </button>
            </div>
          ))}
          <button className="primary" onClick={next}>
            Begin het verhaal
          </button>
        </>
      )}

      {phase.kind === "scene" && (
        <>
          <span className="badge">
            Scène {phase.s + 1} / {story.scenes.length}
          </span>
          {story.scenes[phase.s].image_url && (
            <div className="scene-image">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage */}
              <img key={phase.s} src={story.scenes[phase.s].image_url!} alt="" />
            </div>
          )}
          <div className="card">
            <p className="story-text">
              <InteractiveText text={story.scenes[phase.s].text} targets={story.targets} words={words} onTap={tap} />
            </p>
            {showTranslation && <p className="muted">{story.scenes[phase.s].translation}</p>}
          </div>
          <div className="row">
            <button onClick={() => narrate(story.scenes[phase.s].audio_url, story.scenes[phase.s].text, lang)}>
              🔊 Vertel
            </button>
            <button onClick={() => setShowTranslation((v) => !v)}>👁 Betekenis</button>
            <button className="primary" onClick={next}>
              Vragen →
            </button>
          </div>
        </>
      )}

      {phase.kind === "question" && (
        <QuestionView
          label={`Scène ${phase.s + 1} · nog ${phase.queue.length} ${phase.queue.length === 1 ? "vraag" : "vragen"}`}
          question={story.scenes[phase.s].questions[phase.queue[0]]}
          targets={story.targets}
          words={words}
          onTap={tap}
          lang={lang}
          picked={picked}
          onAnswer={answer}
          onNext={next}
        />
      )}

      {phase.kind === "done" && (
        <div className="card">
          <h1>Fertig! 🎉</h1>
          <p className="story-text">
            {score.correct} van {score.total} goed
          </p>
          <p className="muted">Doe de gebaren nog één keer na voordat je stopt.</p>
          <div className="row">
            {story.targets.map((t) => (
              <span key={t.id} className="badge">
                {t.emoji} {t.text}
              </span>
            ))}
          </div>
          {lookups > 0 && <p className="muted">{lookups} opgezochte woorden komen morgen terug in je herhaling.</p>}
          <Link href="/" className="muted">
            ← Terug naar de verhalen
          </Link>
        </div>
      )}

      {tapped && <WordSheet tapped={tapped} onSpeak={() => speak(tapped.lemma, lang)} onClose={() => setTapped(null)} />}
    </main>
  );
}
