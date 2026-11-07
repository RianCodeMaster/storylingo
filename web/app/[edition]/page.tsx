"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDevActions } from "@/lib/devtools";
import { type Enrollment, getEnrollment, LEVELS, type Level, setLevel } from "@/lib/enrollment";
import { useI18n } from "@/lib/i18n";
import { phraseProgress, type PhraseProgress } from "@/lib/phrases";
import { countDue } from "@/lib/review";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner, supabase } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

const PRINCIPLES = ["input", "bizarre", "body", "picture", "speak", "timing"] as const;

/** The method in one line, and for whoever taps it six short reasons with the research term beside them. */
function WhyItWorks() {
  const { dict } = useI18n();
  return (
    <details className="why">
      <summary>
        {dict.welcome.method} <strong>{dict.welcome.why}</strong>
      </summary>
      <dl>
        {PRINCIPLES.map((key) => {
          const p = dict.welcome.principles[key];
          return (
            <div key={key}>
              <dt>{p.title}</dt>
              <dd>
                {p.line} <span className="term">{p.term}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

/** The levels this edition has stories for, easiest first. */
const levelsOf = (stories: StoryCard[]) => LEVELS.filter((l) => stories.some((s) => s.cefr_level === l));

/** Where to begin at a level: its first story, else the first one above it, else the easiest. */
function firstAt(stories: StoryCard[], level: string): StoryCard | undefined {
  const rank = (l: string) => LEVELS.indexOf(l as Level);
  return stories.find((s) => s.cefr_level === level) ?? stories.find((s) => rank(s.cefr_level) > rank(level)) ?? stories[0];
}

/**
 * An edition's home. A first visit (no enrollment yet) gets the welcome: who it is for, three pillars, how well the
 * learner knows the language, and one button straight into a story at that level. After that the learner lands on
 * their level, their next story and their stories grouped by level, and is offered the next level once they have
 * finished theirs. Levels are a suggestion, never a lock: every story stays open.
 */
export default function Home() {
  const { lang, dict, fill, plural, edition, home } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null | undefined>(undefined);
  const [choice, setChoice] = useState<string | null>(null);
  const [due, setDue] = useState(0);
  const [phrases, setPhrases] = useState<PhraseProgress>({});
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setUserId(await ensureLearner(lang));
      const [enrolled, dueCount, done, list, phraseCounts] = await Promise.all([
        getEnrollment(edition.slug), countDue(edition.target), finishedStories(), listStories(edition),
        phraseProgress(edition.target),
      ]);
      setPhrases(phraseCounts);
      setDue(dueCount);
      setFinished(done);
      setStories(list);
      setEnrollment(enrolled);
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition]);

  // Test tools (development only): finish the stories of your level at once, to see "ready for the next level?".
  useDevActions([
    {
      label: "Alle verhalen van mijn niveau uitgespeeld",
      run: async () => {
        if (!userId || !enrollment || !stories) return;
        const rows = stories
          .filter((s) => s.cefr_level === enrollment.level)
          .map((s) => ({ user_id: userId, story_id: s.id, edition: edition.slug, completed_at: new Date().toISOString() }));
        await supabase().from("sessions").insert(rows);
        window.location.reload();
      },
    },
  ]);

  async function choose(level: string) {
    if (!userId) return null;
    const enrolled = await setLevel(userId, edition.slug, level);
    setEnrollment(enrolled);
    return enrolled;
  }

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!stories || enrollment === undefined) return <main><p className="muted">{dict.common.loading}</p></main>;

  const levels = levelsOf(stories);
  const levelName = (l: string) => `${l} · ${dict.level.names[l as Level]}`;

  if (!enrollment) {
    const level = choice ?? levels[0] ?? "A1";
    const first = firstAt(stories, level);
    return (
      <main className="welcome">
        <p className="edition-name">{edition.name}</p>
        <h1 className="tagline">{edition.tagline}</h1>
        <p className="intro">{edition.intro}</p>
        <ul className="pillars">
          <li>🖼️ {dict.welcome.pillars.words}</li>
          <li>🎤 {dict.welcome.pillars.speak}</li>
          <li>🔁 {dict.welcome.pillars.review}</li>
        </ul>
        {first ? (
          <>
            {levels.length > 1 && (
              <fieldset className="level-choice">
                <legend>{dict.level.question}</legend>
                {levels.map((l) => (
                  <button key={l} className={l === level ? "chosen" : ""} onClick={() => setChoice(l)}>
                    {dict.level.options[l]}
                  </button>
                ))}
              </fieldset>
            )}
            <Link className="cta" href={`${home}/story/${first.id}`} onClick={() => void choose(level)}>
              {dict.welcome.start} <span className="arrow">→</span>
            </Link>
            <p className="muted small">{dict.welcome.free}</p>
          </>
        ) : (
          <p className="card">{dict.welcome.soon}</p>
        )}
        <WhyItWorks />
        {stories.length > 1 && (
          <button className="link muted" onClick={() => void choose(level)}>
            {dict.welcome.choose}
          </button>
        )}
      </main>
    );
  }

  const mine = enrollment.level;
  const unfinished = stories.find((s) => !finished.has(s.id));
  const higher = levels.find((l) => LEVELS.indexOf(l) > LEVELS.indexOf(mine as Level));
  // First an open story at the learner's level; once those are done the next level is offered; at the top level the
  // stories still open below come next.
  const atLevel = stories.find((s) => s.cefr_level === mine && !finished.has(s.id));
  const next = atLevel ?? (higher ? undefined : unfinished);

  return (
    <main>
      <p className="edition-name">{edition.name}</p>
      <h1>{dict.home.yourStories}</h1>
      <div className="row level-bar">
        <span className="badge">{dict.level.yours}: {levelName(mine)}</span>
        {levels.length > 1 && (
          <select aria-label={dict.level.change} value={mine} onChange={(e) => void choose(e.target.value)}>
            {levels.map((l) => (
              <option key={l} value={l}>
                {levelName(l)}
              </option>
            ))}
          </select>
        )}
      </div>
      {due > 0 && (
        <Link href={`${home}/review`} className="card review-banner">
          <strong>{plural(dict.home.due, due)}</strong>
          <span className="muted">{dict.home.dueHint}</span>
        </Link>
      )}

      {(() => {
        // The phrases section, at the learner's level (it goes up to B1).
        const level = phrases[mine] ? mine : Object.keys(phrases).sort().at(-1);
        const p = level ? phrases[level] : undefined;
        return p ? (
          <Link href={`${home}/phrases`} className="card phrases-card">
            <strong>💬 {dict.phrases.title}</strong>
            <span className="muted">{fill(dict.phrases.homeHint, { learned: p.learned, total: p.total, level: level! })}</span>
          </Link>
        ) : null;
      })()}

      {next ? (
        <Link href={`${home}/story/${next.id}`} className="card next-story">
          <span className="muted small">{dict.level.next}</span>
          <strong dir="ltr">{next.title}</strong>
          {next.summary && <span className="muted">{next.summary}</span>}
        </Link>
      ) : higher ? (
        <div className="card next-story">
          <strong>{fill(dict.level.ready, { level: levelName(higher) })}</strong>
          <span className="muted">{fill(dict.level.readyHint, { current: levelName(mine) })}</span>
          <button className="primary" onClick={() => void choose(higher)}>
            {fill(dict.level.readyButton, { level: higher })} <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        !unfinished && stories.length > 0 && <p className="muted">{dict.level.allDone}</p>
      )}

      {stories.length === 0 && <p className="muted">{dict.welcome.soon}</p>}
      {levels.map((l) => {
        const group = stories.filter((s) => s.cefr_level === l);
        const done = group.filter((s) => finished.has(s.id)).length;
        return (
          <section key={l} className={`level-group ${l === mine ? "current" : ""}`}>
            <h2>
              {levelName(l)} <span className="muted small">{fill(dict.level.progress, { done, total: group.length })}</span>
            </h2>
            {group.map((s) => (
              <Link key={s.id} href={`${home}/story/${s.id}`} className="card">
                <div className="row">
                  <span className="badge">
                    {s.language_code.toUpperCase()} {s.cefr_level}
                  </span>
                  {finished.has(s.id) && <span className="muted">{dict.home.finished}</span>}
                </div>
                <strong dir="ltr">{s.title}</strong>
                {s.summary && <span className="muted">{s.summary}</span>}
              </Link>
            ))}
          </section>
        );
      })}
      <WhyItWorks />
    </main>
  );
}
