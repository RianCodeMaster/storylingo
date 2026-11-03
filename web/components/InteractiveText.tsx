"use client";

import type { GlossEntry, Target } from "@/lib/types";

/** What the learner tapped: a glossary word, or one of the story's target structures. */
export interface Tapped {
  lexemeId: string;
  lemma: string;
  gloss: string | null;
  emoji?: string | null;
  gesture?: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD = /(\p{L}[\p{L}'-]*)/u;

/**
 * Story text where target structures are highlighted with their gesture emoji,
 * and every other known word can be tapped for its meaning.
 */
export default function InteractiveText({
  text,
  targets,
  words,
  onTap,
}: {
  text: string;
  targets: Target[];
  words: Map<string, GlossEntry>;
  onTap: (t: Tapped) => void;
}) {
  const targetPattern = targets.length ? new RegExp(`(${targets.map((t) => escape(t.text)).join("|")})`, "gi") : null;
  const chunks = targetPattern ? text.split(targetPattern) : [text];

  return (
    <>
      {chunks.map((chunk, i) => {
        const target = targets.find((t) => t.text.toLowerCase() === chunk.toLowerCase());
        if (target) {
          return (
            <mark
              key={i}
              role="button"
              tabIndex={0}
              onClick={() =>
                onTap({ lexemeId: target.id, lemma: target.text, gloss: target.gloss, emoji: target.emoji, gesture: target.gesture })
              }
            >
              {chunk}
              {target.emoji && ` ${target.emoji}`}
            </mark>
          );
        }
        return chunk.split(WORD).map((part, j) => {
          const entry = words.get(part.toLowerCase());
          if (!entry) return <span key={`${i}-${j}`}>{part}</span>;
          return (
            <span
              key={`${i}-${j}`}
              className="word"
              role="button"
              tabIndex={0}
              onClick={() => onTap({ lexemeId: entry.lexeme_id, lemma: entry.lemma, gloss: entry.gloss })}
            >
              {part}
            </span>
          );
        });
      })}
    </>
  );
}

/** Bottom sheet with the meaning of the tapped word. */
export function WordSheet({ tapped, onSpeak, onClose }: { tapped: Tapped; onSpeak: () => void; onClose: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-label={`Betekenis van ${tapped.lemma}`}>
      <div className="sheet-head">
        <strong className="story-text">
          {tapped.emoji && `${tapped.emoji} `}
          {tapped.lemma}
        </strong>
        <button aria-label="Uitspreken" onClick={onSpeak}>
          🔊
        </button>
        <button aria-label="Sluiten" onClick={onClose}>
          ✕
        </button>
      </div>
      {tapped.gloss && <p className="sheet-gloss">{tapped.gloss}</p>}
      {tapped.gesture && <p className="muted">Gebaar: {tapped.gesture}</p>}
    </div>
  );
}
