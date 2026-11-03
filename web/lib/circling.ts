/**
 * Adaptive circling: a TPRS teacher sees when the class "has it" and moves on, and circles back when it doesn't.
 *
 * - Two quick, correct answers in a row about the same structure: the rest of its questions are skipped.
 * - A wrong answer: that question comes back once at the end of the scene's questions.
 */
import type { Question } from "./types";

export const FAST_MS = 6000;
export const MASTERED_STREAK = 2;

export class Circling {
  private streaks = new Map<string, number>();

  record(lexemeId: string | null, correct: boolean, responseMs: number) {
    if (!lexemeId) return;
    const quick = correct && responseMs < FAST_MS;
    this.streaks.set(lexemeId, quick ? (this.streaks.get(lexemeId) ?? 0) + 1 : 0);
  }

  mastered(lexemeId: string | null): boolean {
    return !!lexemeId && (this.streaks.get(lexemeId) ?? 0) >= MASTERED_STREAK;
  }
}

/** All questions of a scene, minus those about structures the learner already has. */
export function start(questions: Question[], circling: Circling): { queue: number[]; skipped: string[] } {
  return split(questions.map((_, i) => i), questions, circling);
}

/**
 * The questions still to ask in a scene, after the current one is done.
 * Returns the remaining queue and which structures were skipped because the learner already has them.
 */
export function advance(queue: number[], questions: Question[], circling: Circling): { queue: number[]; skipped: string[] } {
  return split(queue.slice(1), questions, circling);
}

function split(rest: number[], questions: Question[], circling: Circling): { queue: number[]; skipped: string[] } {
  const kept = rest.filter((i) => !circling.mastered(questions[i].lexeme_id));
  const skipped = [...new Set(rest.filter((i) => !kept.includes(i)).map((i) => questions[i].lexeme_id!))];
  return { queue: kept, skipped };
}
