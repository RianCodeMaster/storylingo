"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { countDue } from "@/lib/review";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
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

/**
 * An edition's home. A first visit gets the welcome: who it is for, three pillars, one button straight into the
 * easiest story. Once a learner has started, they land on their stories and their review instead.
 */
export default function Home() {
  const { lang, dict, fill, plural, edition, home } = useI18n();
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [due, setDue] = useState(0);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedKey = `storylingo.started.${edition.slug}`;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
      setStarted(localStorage.getItem(startedKey) === "1");
    } catch {}
    (async () => {
      await ensureLearner(lang);
      setDue(await countDue(edition.target));
      setFinished(await finishedStories());
      setStories(await listStories(edition));
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition, startedKey]);

  function markStarted() {
    setStarted(true);
    try {
      localStorage.setItem(startedKey, "1");
    } catch {}
  }

  const returning = started || due > 0 || stories?.some((s) => finished.has(s.id));

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!stories) return <main><p className="muted">{dict.common.loading}</p></main>;

  if (!returning) {
    const first = stories[0];
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
            <Link className="cta" href={`${home}/story/${first.id}`} onClick={markStarted}>
              {dict.welcome.start} <span className="arrow">→</span>
            </Link>
            <p className="muted small">{dict.welcome.free}</p>
          </>
        ) : (
          <p className="card">{dict.welcome.soon}</p>
        )}
        <WhyItWorks />
        {stories.length > 1 && (
          <button className="link muted" onClick={markStarted}>
            {dict.welcome.choose}
          </button>
        )}
      </main>
    );
  }

  return (
    <main>
      <p className="edition-name">{edition.name}</p>
      <h1>{dict.home.yourStories}</h1>
      {due > 0 && (
        <Link href={`${home}/review`} className="card review-banner">
          <strong>{plural(dict.home.due, due)}</strong>
          <span className="muted">{dict.home.dueHint}</span>
        </Link>
      )}
      {stories.length === 0 && <p className="muted">{dict.welcome.soon}</p>}
      {stories.map((s) => (
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
      <WhyItWorks />
    </main>
  );
}
