"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { tierOf, usageToday } from "@/lib/plus";
import { ownedProducts, type Product } from "@/lib/products";
import { type Grade, loadDue, nextState, type ReviewCard, saveGrade } from "@/lib/review";
import { narrate, stopSpeaking } from "@/lib/speech";
import { ensureLearner } from "@/lib/supabase";
import TopBar from "./TopBar";
import { Upsell } from "./Upsell";

/** The three answers to "did you know it?", shared with the phrases section. */
export const GRADES: { grade: Grade; className: string }[] = [
  { grade: "again", className: "wrong" },
  { grade: "hard", className: "" },
  { grade: "good", className: "correct" },
];

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
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0 });
  const [error, setError] = useState<string | null>(null);
  // Without Plus a few cards a day; what is due beyond that waits for tomorrow (or Plus).
  const [capped, setCapped] = useState<{ plus: Product | null; n: number } | null>(null);

  useEffect(() => {
    (async () => {
      setUserId(await ensureLearner(lang));
      const [due, owned, today] = await Promise.all([loadDue(lang, edition.target), ownedProducts(), usageToday()]);
      const tier = tierOf(edition, owned);
      const left = tier.limits ? Math.max(0, tier.limits.reviews_per_day - today.reviews) : due.length;
      if (due.length > left) setCapped({ plus: tier.plus, n: tier.limits?.reviews_per_day ?? 0 });
      setQueue(due.slice(0, left));
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition]);

  const card = queue?.[index];

  // Hear each word as it appears, before seeing its meaning.
  useEffect(() => {
    if (card) narrate(card.audioUrl, card.text, card.language);
    return stopSpeaking;
  }, [card]);

  function answer(grade: Grade) {
    if (!card || !userId) return;
    const next = nextState(card, grade);
    saveGrade(userId, card, grade, next).catch((e) => setError(e.message));
    setTally((t) => ({ ...t, [grade]: t[grade] + 1 }));
    // A word you did not know comes back once more at the end of this round, with its updated state.
    if (grade === "again") setQueue((q) => [...q!, { ...card, ...next }]);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  const bar = <TopBar title={dict.tiles.words} />;

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!queue) return <main><p className="muted">{dict.review.loading}</p></main>;

  const capNote = capped && <Upsell plus={capped.plus} line={fill(dict.plus.reviewsToday, { n: capped.n })} />;

  if (queue.length === 0) {
    return (
      <main>
        {bar}
        {capNote || (
          <div className="card">
            <p className="story-text">{dict.review.nothing}</p>
            <p className="muted">{dict.review.nothingHint}</p>
          </div>
        )}
      </main>
    );
  }

  if (!card) {
    return (
      <main>
        {bar}
        <h2>{dict.review.done}</h2>
        <div className="card">
          <p className="story-text">{fill(dict.review.tally, tally)}</p>
          <p className="muted">{dict.review.doneHint}</p>
        </div>
        {capNote}
      </main>
    );
  }

  return (
    <main>
      {bar}
      <div className="progress">
        <div style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      <span className="badge">
        {index + 1} / {queue.length}
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
