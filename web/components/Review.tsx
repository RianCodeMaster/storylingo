"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type Grade, loadDue, nextState, type ReviewCard, saveGrade } from "@/lib/review";
import { narrate, stopSpeaking } from "@/lib/speech";
import { ensureLearner } from "@/lib/supabase";

const GRADES: { grade: Grade; label: string; className: string }[] = [
  { grade: "again", label: "Wist ik niet", className: "wrong" },
  { grade: "hard", label: "Twijfel", className: "" },
  { grade: "good", label: "Wist ik", className: "correct" },
];

/** The story sentence with the reviewed word in bold. */
function Context({ card }: { card: ReviewCard }) {
  if (!card.sentence) return null;
  const form = card.form ?? card.text;
  const at = card.sentence.toLowerCase().indexOf(form.toLowerCase());
  if (at < 0) return <p className="muted">{card.sentence}</p>;
  return (
    <p className="muted">
      {card.sentence.slice(0, at)}
      <mark>{card.sentence.slice(at, at + form.length)}</mark>
      {card.sentence.slice(at + form.length)}
    </p>
  );
}

export default function Review() {
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setUserId(await ensureLearner());
      setQueue(await loadDue());
    })().catch((e) => setError(String(e.message ?? e)));
  }, []);

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

  if (error) return <main><p className="card">Er ging iets mis: {error}</p></main>;
  if (!queue) return <main><p className="muted">Herhaling laden…</p></main>;

  if (queue.length === 0) {
    return (
      <main>
        <h1>Herhalen</h1>
        <div className="card">
          <p className="story-text">Niets te herhalen vandaag 🎉</p>
          <p className="muted">Woorden die je opzoekt of fout beantwoordt in een verhaal, komen hier vanzelf terug.</p>
        </div>
        <Link href="/" className="muted">← Terug naar de verhalen</Link>
      </main>
    );
  }

  if (!card) {
    return (
      <main>
        <h1>Klaar! 🎉</h1>
        <div className="card">
          <p className="story-text">
            {tally.good} wist je · {tally.hard} twijfel · {tally.again} nog niet
          </p>
          <p className="muted">Wat je wist, zie je pas over een paar dagen terug. Wat je niet wist, morgen weer.</p>
        </div>
        <Link href="/" className="muted">← Terug naar de verhalen</Link>
      </main>
    );
  }

  return (
    <main>
      <div className="progress">
        <div style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      <span className="badge">
        {index + 1} / {queue.length}
      </span>
      <div className="card review-card">
        <p className="review-word">
          {card.emoji && `${card.emoji} `}
          {card.text}
        </p>
        <button onClick={() => narrate(card.audioUrl, card.text, card.language)}>🔊 Nog een keer</button>
        <Context card={card} />
        {revealed && (
          <>
            <p className="sheet-gloss">{card.gloss}</p>
            {card.gesture && <p className="muted">Gebaar: {card.gesture}</p>}
          </>
        )}
      </div>
      {revealed ? (
        <div className="row">
          {GRADES.map((g) => (
            <button key={g.grade} className={`option ${g.className}`} onClick={() => answer(g.grade)}>
              {g.label}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={() => setRevealed(true)}>
          Toon betekenis
        </button>
      )}
    </main>
  );
}
