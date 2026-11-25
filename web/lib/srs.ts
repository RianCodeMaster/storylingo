import { type Card, createEmptyCard, fsrs, generatorParameters, Rating, State } from "ts-fsrs";

/**
 * When a word, phrase or structure comes back: FSRS (Free Spaced Repetition Scheduler, the model Anki has used since
 * 2023), through the ts-fsrs library. Per item it keeps how stable the memory is and how hard the item is, and plans
 * the next review for the moment the learner would otherwise have a 10% chance to have forgotten it (90% retention).
 *
 * What the learning science asks, and how it is done here:
 * - Never right after the answer: recalling what you just saw tests short-term memory, not learning. A new or
 *   forgotten item comes back after minutes (learning steps 1 and 10 minutes, relearning 10 minutes), in the round only
 *   after other cards and never before its time (sessionQueue below); otherwise later in the review.
 * - Then ever longer gaps (spacing): one day, a few days, weeks, as the memory proves stable.
 * - One answer = one review: a second try in the same round counts from where the first left the item, so failing
 *   and then getting it right a minute later does not jump to days.
 * Every part of the app uses this file: the review, the phrases and words, and the words of a story.
 */
export type Grade = "again" | "hard" | "good";

const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good } as const;

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 365,
    enable_fuzz: true, // a little spread, so cards learned together do not all come back on the same day
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
  }),
);

/** What user_lexeme_state stores per learner and item (migration 20261125150000_fsrs.sql). */
export interface SrsRow {
  state: number | null;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  learning_steps: number;
  scheduled_days: number;
  last_review: string | null;
  due_at: string | null;
  exposures: number;
  correct: number;
}

export const SRS_COLUMNS =
  "state, stability, difficulty, reps, lapses, learning_steps, scheduled_days, last_review, due_at, exposures, correct";

export const NEW_ROW: SrsRow = {
  state: null, stability: null, difficulty: null, reps: 0, lapses: 0, learning_steps: 0, scheduled_days: 0,
  last_review: null, due_at: null, exposures: 0, correct: 0,
};

function toCard(row: SrsRow, now: Date): Card {
  if (row.state === null || row.state === State.New || row.stability === null || row.difficulty === null) {
    return createEmptyCard(now);
  }
  return {
    due: row.due_at ? new Date(row.due_at) : now,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0, // ts-fsrs works it out from last_review
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    learning_steps: row.learning_steps,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** The item's state after one answer, ready to save. */
export function schedule(row: SrsRow, grade: Grade, now = new Date()): SrsRow {
  const { card } = scheduler.next(toCard(row, now), now, RATING[grade]);
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    scheduled_days: card.scheduled_days,
    last_review: now.toISOString(),
    due_at: card.due.toISOString(),
    exposures: row.exposures + 1,
    correct: row.correct + (grade === "again" ? 0 : 1),
  };
}

/** The columns to write: the FSRS state plus the old history columns (interval_days = days until the next review). */
export const toColumns = (row: SrsRow) => ({ ...row, interval_days: row.scheduled_days });

/** Whether an item is in (re)learning: it comes back after minutes, not days. */
export const learning = (row: { state: number | null }) => row.state === State.Learning || row.state === State.Relearning;

/**
 * The cards of one round still to come, in order; a card shown leaves the list. A card answered "again" comes back in
 * the same round when it is due within a few minutes, but only after at least GAP other cards and never before its due
 * time; one that is due later waits for the review. next(): the card to show now, or how long until the first waiting
 * one is due (the screen waits, or the learner stops and meets it in the review).
 */
export const GAP = 3;
const IN_ROUND_MS = 3 * 60 * 1000;

export interface Queued<T> {
  item: T;
  notBefore: number; // ms timestamp
}

export const queued = <T,>(items: T[]): Queued<T>[] => items.map((item) => ({ item, notBefore: 0 }));

/** The round without the card just answered (at `shown`), and with it again further on when it is due soon. */
export function afterAnswer<T>(pending: Queued<T>[], shown: number, item: T, row: SrsRow, now = Date.now()): Queued<T>[] {
  const rest = pending.filter((_, i) => i !== shown);
  const due = row.due_at ? Date.parse(row.due_at) : now;
  if (due - now > IN_ROUND_MS) return rest;
  rest.splice(Math.min(rest.length, GAP), 0, { item, notBefore: due });
  return rest;
}

/** The first card that may be shown now, or the wait until one may; null when the round is over. */
export function nextCard<T>(pending: Queued<T>[], now = Date.now()): { index: number } | { wait: number } | null {
  const ready = pending.findIndex((q) => q.notBefore <= now);
  if (ready >= 0) return { index: ready };
  if (pending.length === 0) return null;
  return { wait: Math.min(...pending.map((q) => q.notBefore)) - now };
}
