"use client";

import { useI18n } from "@/lib/i18n";
import type { GlossEntry, Target } from "@/lib/types";

/** What the learner tapped: a glossary word, or one of the story's target structures. */
export interface Tapped {
  lexemeId: string;
  lemma: string;
  gloss: string | null;
  note?: string | null;
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
  core,
  onTap,
}: {
  text: string;
  targets: Target[];
  words: Map<string, GlossEntry>;
  core?: Set<string>; // lexeme ids of the story's core words, taught before the story
  onTap: (t: Tapped) => void;
}) {
  const targetPattern = targets.length ? new RegExp(`(${targets.map((t) => escape(t.text)).join("|")})`, "gi") : null;
  const chunks = targetPattern ? text.split(targetPattern) : [text];

  return (
    // The story keeps its own writing direction, also inside a right-to-left app.
    <span dir="ltr">
      {chunks.map((chunk, i) => {
        const target = targets.find((t) => t.text.toLowerCase() === chunk.toLowerCase());
        if (target) {
          return (
            <mark
              key={i}
              role="button"
              tabIndex={0}
              onClick={() =>
                onTap({
                  lexemeId: target.id,
                  lemma: target.text,
                  gloss: target.gloss,
                  note: target.note,
                  emoji: target.emoji,
                  gesture: target.gesture,
                })
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
              className={core?.has(entry.lexeme_id) ? "word core" : "word"}
              role="button"
              tabIndex={0}
              onClick={() => onTap({ lexemeId: entry.lexeme_id, lemma: entry.lemma, gloss: entry.gloss })}
            >
              {part}
            </span>
          );
        });
      })}
    </span>
  );
}

/** Bottom sheet with the meaning of the tapped word. */
export function WordSheet({ tapped, onSpeak, onClose }: { tapped: Tapped; onSpeak: () => void; onClose: () => void }) {
  const { dict, fill } = useI18n();
  return (
    <div className="sheet" role="dialog" aria-label={fill(dict.word.meaningOf, { word: tapped.lemma })}>
      <div className="sheet-head">
        <strong className="story-text" dir="ltr">
          {tapped.emoji && `${tapped.emoji} `}
          {tapped.lemma}
        </strong>
        <button aria-label={dict.word.speak} onClick={onSpeak}>
          🔊
        </button>
        <button aria-label={dict.word.close} onClick={onClose}>
          ✕
        </button>
      </div>
      {tapped.gloss && <p className="sheet-gloss">{tapped.gloss}</p>}
      {tapped.note && <p className="muted">{tapped.note}</p>}
      {tapped.gesture && <p className="muted">{fill(dict.common.gesture, { gesture: tapped.gesture })}</p>}
    </div>
  );
}
