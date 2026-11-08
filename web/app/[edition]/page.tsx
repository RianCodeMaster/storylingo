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

/**
 * An edition's home. A first visit (no enrollment yet) gets the welcome: who it is for, three pillars, how well the
 * learner knows the language (asked once), and one button straight into a story at that level. After that the
 * learner sees only their own level: its next story, its stories and its phrases, and is offered the next level once
 * they have finished it. Switching level by hand stays possible.
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

  // The levels this edition offers (content/editions/<slug>.yaml), else those it has stories for.
  const offered = LEVELS.filter((l) => edition.stories.levels.includes(l));
  const levels = offered.length ? offered : levelsOf(stories);
  const levelName = (l: string) => `${l} · ${dict.level.names[l as Level]}`;

  if (!enrollment) {
    const level = choice ?? levels[0] ?? "A1";
    // Straight into a story at the chosen level; without one yet, to the start screen (the phrases are there).
    const first = stories.find((s) => s.cefr_level === level);
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
        {stories.length > 0 ? (
          <>
            {levels.length > 1 && (
              <fieldset className="level-choice">
                <legend>{dict.level.question}</legend>
                {levels.map((l) => (
                  <button key={l} className={l === level ? "chosen" : ""} onClick={() => setChoice(l)}>
                    {dict.level.options[l]} <span className="muted small">{l}</span>
                  </button>
                ))}
                <p className="muted small">{dict.level.onlyYours}</p>
              </fieldset>
            )}
            {first ? (
              <Link className="cta" href={`${home}/story/${first.id}`} onClick={() => void choose(level)}>
                {dict.welcome.start} <span className="arrow">→</span>
              </Link>
            ) : (
              <button className="cta" onClick={() => void choose(level)}>
                {dict.welcome.start} <span className="arrow">→</span>
              </button>
            )}
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

  // Only the learner's own level is shown: its stories, its phrases. Once its stories are done, the next level that
  // has stories is offered; switching by hand stays possible.
  const mine = enrollment.level;
  const group = stories.filter((s) => s.cefr_level === mine);
  const done = group.filter((s) => finished.has(s.id)).length;
  const next = group.find((s) => !finished.has(s.id));
  const higher = levelsOf(stories).find((l) => LEVELS.indexOf(l) > LEVELS.indexOf(mine as Level));

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
      ) : group.length === 0 ? (
        <p className="card">{fill(dict.level.noneYet, { level: levelName(mine) })}</p>
      ) : higher ? (
        <div className="card next-story">
          <strong>{fill(dict.level.ready, { level: levelName(higher) })}</strong>
          <span className="muted">{fill(dict.level.readyHint, { current: levelName(mine) })}</span>
          <button className="primary" onClick={() => void choose(higher)}>
            {fill(dict.level.readyButton, { level: higher })} <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        <p className="muted">{dict.level.allDone}</p>
      )}

      {group.length > 0 && (
        <section className="level-group current">
          <h2>
            {levelName(mine)} <span className="muted small">{fill(dict.level.progress, { done, total: group.length })}</span>
          </h2>
          {group.map((s) => (
            <Link key={s.id} href={`${home}/story/${s.id}`} className="card">
              {finished.has(s.id) && <span className="muted small">{dict.home.finished}</span>}
              <strong dir="ltr">{s.title}</strong>
              {s.summary && <span className="muted">{s.summary}</span>}
            </Link>
          ))}
        </section>
      )}
      <WhyItWorks />
    </main>
  );
}
