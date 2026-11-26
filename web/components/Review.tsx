"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { type Grade, loadDue, type ReviewCard } from "@/lib/review";
import { narrate, stopSpeaking } from "@/lib/speech";
import { ensureLearner } from "@/lib/supabase";
import TopBar from "./TopBar";
import { useRound } from "./useRound";

/** The three answers to "did you know it?", shared with the phrases section. */
export const GRADES: { grade: Grade; className: string }[] = [
  { grade: "again", className: "wrong" },
  { grade: "hard", className: "" },
  { grade: "good", className: "correct" },
];

/**
 * The pause in a round when the only cards left are ones that came back and are not due yet: a short countdown (it
 * goes on by itself), or stop now and meet them in the review later. Shared with the phrases and words.
 */
export function Waiting({ ms, onStop }: { ms: number; onStop: () => void }) {
  const { dict, fill } = useI18n();
  const s = Math.max(0, Math.ceil(ms / 1000));
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="card waiting">
      <p className="story-text">⏳ {fill(dict.review.wait, { time })}</p>
      <p className="muted">{dict.review.waitWhy}</p>
      <button onClick={onStop}>{dict.review.stopNow}</button>
    </div>
  );
}

/** The story sentence with the reviewed word in bold. */
function Context({ card }: { card: ReviewCard }) {
  if (!card.sentence) return null;
  const form = card.form ?? card.text;
  const at = card.sentence.toLowerCase().indexOf(form.toLowerCase());
  if (at < 0) return <p className="muted" dir="ltr">{card.sentence}</p>;
  return (
    <p className="muted" dir="ltr">
      {card.sentence.slice(0, at)}
      <mark>{card.sentence.slice(at, at + form.length)}</mark>
      {card.sentence.slice(at + form.length)}
    </p>
  );
}

export default function Review() {
  const { lang, dict, fill, edition } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [cards, setCards] = useState<ReviewCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const round = useRound(cards, userId);
  const card = round.current;

  useEffect(() => {
    (async () => {
      setUserId(await ensureLearner(lang));
      // Everything that is due, without a daily limit: what is due should be repeated now, that is what makes it stick.
      setCards(await loadDue(lang, edition.target));
    })().catch((e) => setLoadError(String(e.message ?? e)));
  }, [lang, edition]);

  // Hear each word as it appears, before seeing its meaning.
  useEffect(() => {
    if (card) narrate(card.audioUrl, card.text, card.language);
    return stopSpeaking;
  }, [card]);

  function answer(grade: Grade) {
    round.answer(grade);
    setRevealed(false);
  }

  const bar = <TopBar title={dict.tiles.words} />;
  const error = loadError ?? round.error;

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!cards) return <main><p className="muted">{dict.review.loading}</p></main>;

  // Nothing (more) due is never a dead end: learning something new is always one tap away.
  const learnNew = (
    <div className="row">
      <Link className="cta" href={`/${edition.slug}/words`}>{dict.review.learnWords}</Link>
      <Link className="cta" href={`/${edition.slug}/phrases`}>{dict.review.learnPhrases}</Link>
    </div>
  );

  if (cards.length === 0) {
    return (
      <main>
        {bar}
        <div className="card">
          <p className="story-text">{dict.review.nothing}</p>
          <p className="muted">{dict.review.nothingHint}</p>
        </div>
        {learnNew}
      </main>
    );
  }

  if (round.done || stopped) {
    return (
      <main>
        {bar}
        <h2>{dict.review.done}</h2>
        <div className="card">
          <p className="story-text">{fill(dict.review.tally, round.tally)}</p>
          <p className="muted">{dict.review.doneHint}</p>
        </div>
        {learnNew}
      </main>
    );
  }

  if (!card) {
    return (
      <main>
        {bar}
        <Waiting ms={round.waiting ?? 0} onStop={() => setStopped(true)} />
      </main>
    );
  }

  const total = round.answered + round.left;
  return (
    <main>
      {bar}
      <div className="progress">
        <div style={{ width: `${(round.answered / total) * 100}%` }} />
      </div>
      <span className="badge">
        {round.answered + 1} / {total}
      </span>
      <div className="card review-card">
        <p className="review-word" dir="ltr">
          {card.emoji && `${card.emoji} `}
          {card.text}
        </p>
        <button onClick={() => narrate(card.audioUrl, card.text, card.language)}>{dict.common.again}</button>
        <Context card={card} />
        {revealed && (
          <>
            {card.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
              <img className="word-picture" src={card.imageUrl} alt="" />
            )}
            <p className="sheet-gloss">{card.gloss}</p>
            {card.gesture && <p className="muted">{fill(dict.common.gesture, { gesture: card.gesture })}</p>}
          </>
        )}
      </div>
      {revealed ? (
        <div className="row">
          {GRADES.map((g) => (
            <button key={g.grade} className={`option ${g.className}`} onClick={() => answer(g.grade)}>
              {dict.review[g.grade]}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={() => setRevealed(true)}>
          {dict.review.reveal}
        </button>
      )}
    </main>
  );
}
