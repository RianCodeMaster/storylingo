"use client";

import { useEffect, useState } from "react";
import { useDevActions } from "@/lib/devtools";
import { getEnrollment } from "@/lib/enrollment";
import { useI18n } from "@/lib/i18n";
import { learnedPhrases, loadPhrases, type PhraseCard } from "@/lib/phrases";
import { type Grade, NEW_STATE, nextState, saveGrade, type SrsState } from "@/lib/review";
import { narrate, stopSpeaking } from "@/lib/speech";
import { ensureLearner, supabase } from "@/lib/supabase";
import { GRADES } from "./Review";
import TopBar from "./TopBar";

const BATCH = 10;
// The phrases section goes up to B1 (content/phrases/<language>/A1|A2|B1.yaml).
const PHRASE_LEVELS: readonly string[] = ["A1", "A2", "B1"];
const DIRECTION_KEY = "storylingo.phraseDirection";

/** understand: hear and read the phrase, recall its meaning. say: read the meaning, say the phrase, then hear it. */
type Direction = "understand" | "say";

/**
 * Ten phrases as flash cards: the answer stays hidden until the learner has tried, then they grade themselves
 * (didn't know / unsure / knew it), the same three answers as the daily review. Recalling before seeing the answer
 * sticks far better than recognising it (the testing effect). A phrase you didn't know comes back at the end of the
 * round; every answer goes into spaced repetition, next to the story words.
 */
function Practice({ batch, lang, direction, onDone }: { batch: PhraseCard[]; lang: string; direction: Direction; onDone: () => void }) {
  const { dict, fill, lang: base } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<(PhraseCard & SrsState)[]>(() => batch.map((p) => ({ ...p, ...NEW_STATE })));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0 });
  const [error, setError] = useState<string | null>(null);
  const card = queue[index];

  useEffect(() => {
    ensureLearner(base).then(setUserId).catch((e) => setError(e.message));
  }, [base]);

  // Understanding starts with hearing; saying hears the phrase only as the answer.
  useEffect(() => {
    if (card && direction === "understand") narrate(card.audioUrl, card.text, lang);
    return stopSpeaking;
  }, [card, direction, lang]);

  function reveal() {
    setRevealed(true);
    if (direction === "say") narrate(card.audioUrl, card.text, lang);
  }

  function grade(g: Grade) {
    if (!userId) return;
    const next = nextState(card, g);
    saveGrade(userId, card, g, next).catch((e) => setError(e.message));
    setTally((t) => ({ ...t, [g]: t[g] + 1 }));
    if (g === "again") setQueue((q) => [...q, { ...card, ...next }]);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (error) return <p className="card">{fill(dict.common.error, { error })}</p>;

  if (!card) {
    return (
      <div className="card">
        <h1>{dict.review.done}</h1>
        <p className="story-text">{fill(dict.review.tally, tally)}</p>
        <p className="muted">{dict.phrases.done}</p>
        <button className="primary" onClick={onDone}>
          {dict.phrases.back}
        </button>
      </div>
    );
  }

  const phrase = (
    <>
      {/* As the answer (say), the phrase stands out in the edition's color. */}
      <p className={direction === "say" ? "review-word answer" : "review-word"} dir="ltr">
        {card.text}
      </p>
      <button onClick={() => narrate(card.audioUrl, card.text, lang)}>{dict.common.again}</button>
    </>
  );
  const meaning = <p className={direction === "say" ? "review-word" : "sheet-gloss"}>{card.meaning}</p>;

  return (
    <>
      <div className="progress">
        <div style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      <span className="badge">{fill(dict.phrases.card, { n: index + 1, total: queue.length })}</span>
      <p className="muted">{direction === "understand" ? dict.phrases.hint : dict.phrases.sayHint}</p>
      <div className="card word-card">
        {direction === "understand" ? phrase : meaning}
        {revealed && (direction === "understand" ? meaning : phrase)}
      </div>
      {revealed ? (
        <div className="row">
          {GRADES.map((g) => (
            <button key={g.grade} className={`option ${g.className}`} onClick={() => grade(g.grade)}>
              {dict.review[g.grade]}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={reveal}>
          {direction === "understand" ? dict.review.reveal : dict.phrases.showAnswer}
        </button>
      )}
    </>
  );
}

/** The phrases section of an edition at the learner's level: how far they are, and ten new phrases at a time. */
export default function Phrases() {
  const { lang, dict, fill, edition } = useI18n();
  const [level, setLevel] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("understand");
  const [phrases, setPhrases] = useState<PhraseCard[] | null>(null);
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<PhraseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start at the learner's level in this edition (the phrases stop at B1), in the direction chosen last time.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
      if (localStorage.getItem(DIRECTION_KEY) === "say") setDirection("say");
    } catch {}
    (async () => {
      await ensureLearner(lang);
      const enrolled = await getEnrollment(edition.slug);
      const mine = enrolled?.level;
      setLevel(mine && PHRASE_LEVELS.includes(mine) ? mine : mine ? "B1" : "A1");
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition.slug]);

  function chooseDirection(d: Direction) {
    setDirection(d);
    try {
      localStorage.setItem(DIRECTION_KEY, d);
    } catch {}
  }

  // Test tools (development only): practise this level's phrases again from scratch.
  useDevActions([
    {
      label: "Zinnen van dit niveau weer als nieuw",
      run: async () => {
        const ids = phrases?.map((p) => p.lexemeId) ?? [];
        if (ids.length) await supabase().from("user_lexeme_state").delete().in("lexeme_id", ids);
        window.location.reload();
      },
    },
  ]);

  useEffect(() => {
    if (!level || batch) return;
    (async () => {
      const [list, done] = await Promise.all([loadPhrases(edition, level), learnedPhrases(edition.target)]);
      setPhrases(list);
      setLearned(done);
    })().catch((e) => setError(String(e.message ?? e)));
  }, [level, edition, batch]);

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (batch) {
    return (
      <main>
        <TopBar title={dict.phrases.title} />
        <Practice batch={batch} lang={edition.target} direction={direction} onDone={() => setBatch(null)} />
      </main>
    );
  }

  const fresh = phrases?.filter((p) => !learned.has(p.lexemeId)) ?? [];
  const done = (phrases?.length ?? 0) - fresh.length;
  return (
    <main>
      <TopBar title={dict.phrases.title} />
      <p className="muted">{dict.phrases.intro}</p>
      {/* Only the learner's level (chosen once, changed on the start screen): no choosing here. */}
      {level && (
        <span className="badge">
          {dict.level.yours}: {level} · {dict.level.names[level as keyof typeof dict.level.names]}
        </span>
      )}
      <div className="row">
        {(["understand", "say"] as const).map((d) => (
          <button key={d} className={d === direction ? "chosen-level" : ""} onClick={() => chooseDirection(d)}>
            {dict.phrases[d]}
          </button>
        ))}
      </div>
      {!phrases ? (
        <p className="muted">{dict.common.loading}</p>
      ) : (
        <div className="card">
          <strong>{fill(dict.phrases.progress, { learned: done, total: phrases.length })}</strong>
          <div className="progress">
            <div style={{ width: `${phrases.length ? (100 * done) / phrases.length : 0}%` }} />
          </div>
          {fresh.length > 0 ? (
            <button className="primary" onClick={() => setBatch(fresh.slice(0, BATCH))}>
              {fresh.length < BATCH ? dict.phrases.more : dict.phrases.learn}
            </button>
          ) : (
            <p className="muted">{dict.phrases.allLearned}</p>
          )}
        </div>
      )}
    </main>
  );
}
