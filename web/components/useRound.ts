"use client";

import { useEffect, useState } from "react";
import { saveGrade } from "@/lib/review";
import { afterAnswer, type Grade, nextCard, type Queued, queued, schedule, type SrsRow } from "@/lib/srs";

/**
 * One round of cards (the review, ten new phrases or words): which card to show, the answer, and the wait when the
 * only cards left are ones answered "again" that are not due yet (lib/srs.ts: never right after the answer). Every
 * answer is saved at once, so stopping halfway loses nothing: what is not due yet comes back in the review.
 */
export function useRound<T extends { lexemeId: string; srs: SrsRow }>(items: T[] | null, userId: string | null) {
  const [pending, setPending] = useState<Queued<T>[] | null>(null);
  const [answered, setAnswered] = useState(0);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0 });
  // The clock starts in the browser (with the round), never while the page is built.
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A new list of cards starts a new round.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the round follows the loaded cards
    setPending(items ? queued(items) : null);
    setAnswered(0);
    setNow(Date.now());
  }, [items]);

  const next = pending ? nextCard(pending, now) : null;
  const waiting = next && "wait" in next ? next.wait : null;

  // While waiting, tick every second (a countdown) until the first waiting card is due.
  useEffect(() => {
    if (waiting === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const index = next && "index" in next ? next.index : null;
  const current = pending && index !== null ? pending[index].item : null;

  function answer(grade: Grade) {
    if (!pending || index === null || !current || !userId) return;
    const row = schedule(current.srs, grade);
    saveGrade(userId, current.lexemeId, grade, row).catch((e) => setError(e.message));
    setTally((t) => ({ ...t, [grade]: t[grade] + 1 }));
    setAnswered((n) => n + 1);
    const at = Date.now();
    setNow(at);
    setPending(afterAnswer(pending, index, { ...current, srs: row }, row, at));
  }

  return {
    current,
    waiting, // ms until a card that came back may be shown, or null
    done: !!pending && pending.length === 0,
    answered,
    left: pending?.length ?? 0,
    tally,
    error,
    answer,
  };
}
