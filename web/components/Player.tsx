"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { advance, Circling, start } from "@/lib/circling";
import { useI18n } from "@/lib/i18n";
import { canListen, listen, matchAnswer, type ListenError } from "@/lib/listen";
import { feedback, narrate, phrases, speak, stopSpeaking } from "@/lib/speech";
import { finishSession, recordAnswer, recordLookup, startSession } from "@/lib/story";
import type { GlossEntry, Question, Story, Target } from "@/lib/types";
import InteractiveText, { WordSheet, type Tapped } from "./InteractiveText";
import Shadowing, { pickLines } from "./Shadowing";
import WordsIntro, { type WordResults } from "./WordsIntro";

type Phase =
  | { kind: "words" } // the core words and the listening game, before everything else
  | { kind: "intro" }
  | { kind: "scene"; s: number }
  | { kind: "question"; s: number; queue: number[] } // queue[0] is the question being asked
  | { kind: "shadow" } // repeat a few sentences after the narrator, after the last questions
  | { kind: "done" };

type Heard = { text: string; matched: boolean };

const VOICE_KEY = "storylingo.voice";

function QuestionView(props: {
  label: string;
  question: Question;
  targets: Target[];
  words: Map<string, GlossEntry>;
  onTap: (t: Tapped) => void;
  lang: string;
  picked: string | null;
  line: string | null; // what the teacher just said about the answer
  onAnswer: (option: string) => void;
  onNext: () => void;
  mic: boolean; // this browser can listen
  voice: boolean; // listen by itself after every question
  listening: boolean;
  heard: Heard | null;
  listenError: ListenError;
  onListen: () => void;
  onToggleVoice: () => void;
}) {
  const { question, picked } = props;
  const { dict } = useI18n();
  return (
    <>
      <span className="badge">{props.label}</span>
      <div className="card">
        <p className="story-text">
          <InteractiveText text={question.prompt} targets={props.targets} words={props.words} onTap={props.onTap} />
        </p>
        <button onClick={() => narrate(question.audio_url, question.prompt, props.lang)}>{dict.common.again}</button>
      </div>
      <div className="row" dir="ltr">
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
      {props.mic && !picked && (
        <div className="row">
          <button className={`mic ${props.listening ? "listening" : ""}`} disabled={props.listening} onClick={props.onListen}>
            {props.listening ? dict.story.listening : dict.story.speak}
          </button>
          <label className="muted toggle">
            <input type="checkbox" checked={props.voice} onChange={props.onToggleVoice} /> {dict.story.autoListen}
          </label>
        </div>
      )}
      {props.heard?.text && (
        <p className="muted" dir="ltr">
          🎤 &quot;{props.heard.text}&quot;
        </p>
      )}
      {props.heard && !props.heard.matched && !picked && (
        <p className="muted">{props.heard.text ? dict.story.notMatched : dict.story.nothingHeard}</p>
      )}
      {props.listenError && <p className="muted">{props.listenError === "blocked" ? dict.story.micBlocked : dict.story.micFailed}</p>}
      {picked && (
        <>
          <p className="big-feedback" dir="ltr">
            {picked === question.answer ? `${props.line} 🎉` : `${props.line} → ${question.answer}`}
          </p>
          <button className="primary" onClick={props.onNext}>
            {phrases(props.lang).next} <span className="arrow">→</span>
          </button>
        </>
      )}
    </>
  );
}

export default function Player({ story, userId, onRestart }: { story: Story; userId: string; onRestart: () => void }) {
  // `base` is the learner's language (texts around the story), `lang` below the story's own language.
  const { dict, fill, plural, home, edition } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: story.words.length ? "words" : "intro" });
  const [line, setLine] = useState<string | null>(null);
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
  // Answering out loud: `voice` is the learner's choice (kept in this browser), `asking` the question on screen.
  const [mic, setMic] = useState(false);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [listenError, setListenError] = useState<ListenError>(null);
  const voiceRef = useRef(false);
  const asking = useRef<string | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const answerRef = useRef<(option: string) => void>(() => {});
  const listenRef = useRef<(question: Question) => void>(() => {});
  const lang = story.language_code;

  // Every glossary word of the story, so words in questions are tappable too.
  const [words] = useState(() => {
    const map = new Map<string, GlossEntry>();
    for (const scene of story.scenes) for (const e of scene.glossary ?? []) if (!map.has(e.word.toLowerCase())) map.set(e.word.toLowerCase(), e);
    return map;
  });
  const [coreIds] = useState(() => new Set(story.words.map((w) => w.lexeme_id)));
  const [shadowLines] = useState(() => pickLines(story));

  // The listening game counts like answers: its words enter review when the story is finished.
  function wordsDone(wordResults: WordResults) {
    for (const [id, r] of wordResults) results.current.set(id, r);
    setPhase({ kind: "intro" });
  }

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
    phase.kind === "done" || phase.kind === "shadow" ? 1
    : phase.kind === "scene" ? phase.s / scenes
    : phase.kind === "question" ? (phase.s + 1 - phase.queue.length / (story.scenes[phase.s].questions.length + 1)) / scenes
    : 0;

  // Known only in the browser, so read after the first render.
  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(VOICE_KEY) === "1";
    } catch {}
    voiceRef.current = saved && canListen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values, unknown during server render
    setMic(canListen());
    setVoice(voiceRef.current);
  }, []);

  function stopListening() {
    stopListen.current?.();
    stopListen.current = null;
    setListening(false);
  }

  /** Listen for the answer to this question; a recognised answer counts exactly like a tap. */
  function listenFor(question: Question) {
    stopListen.current?.();
    setHeard(null);
    setListenError(null);
    setListening(true);
    stopListen.current = listen(
      lang,
      (alternatives) => {
        if (asking.current !== question.id) return;
        const option = matchAnswer(alternatives, question.options, lang);
        setHeard({ text: alternatives[0] ?? "", matched: option !== null });
        if (option) answerRef.current(option);
      },
      (error) => {
        stopListen.current = null;
        setListening(false);
        setListenError(error);
        if (error === "blocked") {
          voiceRef.current = false;
          setVoice(false);
        }
      },
    );
  }

  function toggleVoice() {
    const on = !voice;
    voiceRef.current = on;
    setVoice(on);
    try {
      localStorage.setItem(VOICE_KEY, on ? "1" : "0");
    } catch {}
    if (!on) return stopListening();
    if (phase.kind === "question" && !picked) listenFor(story.scenes[phase.s].questions[phase.queue[0]]);
  }

  // Tell each scene and ask each question automatically, like a teacher in front of the class.
  useEffect(() => {
    if (phase.kind === "scene") {
      const scene = story.scenes[phase.s];
      narrate(scene.audio_url, scene.text, lang);
    }
    if (phase.kind === "question") {
      askedAt.current = Date.now();
      const question = story.scenes[phase.s].questions[phase.queue[0]];
      asking.current = question.id;
      // With voice on, the microphone opens once the question has been asked (not during it: it would hear itself).
      narrate(question.audio_url, question.prompt, lang, () => {
        if (voiceRef.current && asking.current === question.id) listenRef.current(question);
      });
    }
    return () => {
      stopSpeaking();
      asking.current = null;
      stopListen.current?.();
      stopListen.current = null;
    };
  }, [phase, story, lang]);

  function answer(option: string) {
    if (phase.kind !== "question" || picked) return;
    stopListening();
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
    setLine(feedback(correct, lang));
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
    if (names.length) setSkipNote(fill(dict.story.skipped, { names: names.join(", ") }));
  }

  function next() {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = null;
    setPicked(null);
    setShowTranslation(false);
    setTapped(null);
    setSkipNote(null);
    setHeard(null);
    setListenError(null);
    stopListening();
    if (phase.kind === "intro") {
      startSession(userId, story.id, edition.slug).then(setSessionId).catch((e) => setError(e.message));
      return setPhase({ kind: "scene", s: 0 });
    }
    if (phase.kind === "words" || phase.kind === "shadow" || phase.kind === "done") return;
    const questions = story.scenes[phase.s].questions;
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
    // The story counts as finished here: what comes after (shadowing) is extra and may be skipped.
    setPhase({ kind: shadowLines.length ? "shadow" : "done" });
    if (sessionId) finishSession(sessionId, userId, results.current).catch((e) => setError(e.message));
  }

  // Timers and the microphone call back later: they must use the latest functions, not those of an old render.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
    answerRef.current = answer;
    listenRef.current = listenFor;
  });

  return (
    <main>
      <div className="progress">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      {error && <p className="card">{fill(dict.story.saveFailed, { error })}</p>}
      {skipNote && <p className="skip-note">{skipNote}</p>}

      {phase.kind === "words" && <WordsIntro title={story.title} words={story.words} lang={lang} onDone={wordsDone} />}

      {phase.kind === "intro" && (
        <>
          <h1 dir="ltr">{story.title}</h1>
          <p className="muted">{dict.story.gesturesIntro}</p>
          {story.targets.map((t) => (
            <div key={t.id} className="card gesture">
              <span className="emoji">{t.emoji ?? "✋"}</span>
              <div>
                <strong>
                  <bdi>{t.text}</bdi> = {t.gloss}
                </strong>
                {t.note && <p className="muted">{t.note}</p>}
                {t.gesture && <p className="muted">{t.gesture}</p>}
              </div>
              <button aria-label={fill(dict.story.pronounce, { word: t.text })} onClick={() => speak(t.text, lang, "cheer")}>
                🔊
              </button>
            </div>
          ))}
          <button className="primary" onClick={next}>
            {dict.story.begin}
          </button>
        </>
      )}

      {phase.kind === "scene" && (
        <>
          <span className="badge">{fill(dict.story.scene, { n: phase.s + 1, total: story.scenes.length })}</span>
          {story.scenes[phase.s].image_url && (
            <div className="scene-image">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage */}
              <img key={phase.s} src={story.scenes[phase.s].image_url!} alt="" />
            </div>
          )}
          <div className="card">
            <p className="story-text">
              <InteractiveText text={story.scenes[phase.s].text} targets={story.targets} words={words} core={coreIds} onTap={tap} />
            </p>
            {showTranslation && <p className="muted">{story.scenes[phase.s].translation}</p>}
          </div>
          <div className="row">
            <button onClick={() => narrate(story.scenes[phase.s].audio_url, story.scenes[phase.s].text, lang)}>
              {dict.story.tell}
            </button>
            <button onClick={() => setShowTranslation((v) => !v)}>{dict.story.meaning}</button>
            <button className="primary" onClick={next}>
              {dict.story.toQuestions}
            </button>
          </div>
        </>
      )}

      {phase.kind === "question" && (
        <QuestionView
          label={plural(dict.story.questionsLeft, phase.queue.length, { n: phase.s + 1, left: phase.queue.length })}
          question={story.scenes[phase.s].questions[phase.queue[0]]}
          targets={story.targets}
          words={words}
          onTap={tap}
          lang={lang}
          picked={picked}
          line={line}
          onAnswer={answer}
          onNext={next}
          mic={mic}
          voice={voice}
          listening={listening}
          heard={heard}
          listenError={listenError}
          onListen={() => listenFor(story.scenes[phase.s].questions[phase.queue[0]])}
          onToggleVoice={toggleVoice}
        />
      )}

      {phase.kind === "shadow" && <Shadowing lines={shadowLines} lang={lang} onDone={() => setPhase({ kind: "done" })} />}

      {phase.kind === "done" && (
        <div className="card">
          <h1 dir="ltr">{phrases(lang).done} 🎉</h1>
          <p className="story-text">{fill(dict.story.score, { correct: score.correct, total: score.total })}</p>
          <p className="muted">{dict.story.gesturesOnceMore}</p>
          <div className="row" dir="ltr">
            {story.targets.map((t) => (
              <span key={t.id} className="badge">
                {t.emoji} {t.text}
              </span>
            ))}
          </div>
          {lookups > 0 && <p className="muted">{plural(dict.story.lookups, lookups)}</p>}
          <button className="primary" onClick={onRestart}>
            {dict.story.playAgain}
          </button>
          <Link href={home} className="muted">
            {dict.common.back}
          </Link>
        </div>
      )}

      {tapped && <WordSheet tapped={tapped} onSpeak={() => speak(tapped.lemma, lang)} onClose={() => setTapped(null)} />}
    </main>
  );
}
