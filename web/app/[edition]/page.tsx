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

/** The learner's level as a small pill; tapping it opens the phone's own list to switch. */
function LevelChip(props: { levels: readonly string[]; mine: string; name: (l: string) => string; onChoose: (l: string) => void }) {
  const { dict } = useI18n();
  return (
    <label className="level-chip">
      {props.name(props.mine)}
      {props.levels.length > 1 && (
        <>
          <span aria-hidden> ▾</span>
          <select aria-label={dict.level.change} value={props.mine} onChange={(e) => props.onChoose(e.target.value)}>
            {props.levels.map((l) => (
              <option key={l} value={l}>
                {props.name(l)}
              </option>
            ))}
          </select>
        </>
      )}
    </label>
  );
}

/**
 * An edition's home. A first visit (no enrollment yet) gets the welcome: who it is for, three pillars, how well the
 * learner knows the language (asked once), and one button straight into a story at that level. After that the
 * start screen is calm: the edition and the level (a pill, tap to switch), one big card with the next story, and a
 * tile per part of the app (stories, words, phrases). Only the learner's own level is shown; once its stories are
 * done, the next level is offered.
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

  // The phrases section stops at B1: a higher level practises the B1 phrases.
  const phraseLevel = phrases[mine] ? mine : Object.keys(phrases).sort().at(-1);
  const phraseCount = phraseLevel ? phrases[phraseLevel] : undefined;

  return (
    <main className="dash">
      <header className="dash-head">
        <span className="edition-name">{edition.name}</span>
        <LevelChip levels={levels} mine={mine} name={levelName} onChoose={(l) => void choose(l)} />
      </header>

      {/* One clear next step: the next story at the learner's level. */}
      {next ? (
        <Link href={`${home}/story/${next.id}`} className="hero">
          {next.cover && (
            // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
            <img src={next.cover} alt="" />
          )}
          <div className="hero-body">
            <span className="hero-label">{done ? dict.home.continue : dict.level.next}</span>
            <strong dir="ltr">{next.title}</strong>
            {next.summary && <span className="hero-summary">{next.summary}</span>}
            <span className="hero-play">{dict.home.play}</span>
          </div>
        </Link>
      ) : group.length === 0 ? (
        <p className="card">{fill(dict.level.noneYet, { level: levelName(mine) })}</p>
      ) : higher ? (
        <div className="card hero-plain">
          <strong>{fill(dict.level.ready, { level: levelName(higher) })}</strong>
          <span className="muted">{fill(dict.level.readyHint, { current: levelName(mine) })}</span>
          <button className="primary" onClick={() => void choose(higher)}>
            {fill(dict.level.readyButton, { level: higher })} <span className="arrow">→</span>
          </button>
        </div>
      ) : (
        <p className="card hero-plain">{dict.level.allDone}</p>
      )}

      {/* Everything else: one tile per part of the app. */}
      <nav className="tiles">
        <Link href={`${home}/stories`} className="tile">
          <span className="tile-icon">📖</span>
          <strong>{dict.tiles.stories}</strong>
          <span className="tile-sub">{fill(dict.tiles.count, { done, total: group.length })}</span>
        </Link>
        <Link href={`${home}/review`} className="tile">
          <span className="tile-icon">🔁</span>
          {due > 0 && <span className="tile-dot">{due}</span>}
          <strong>{dict.tiles.words}</strong>
          <span className="tile-sub">{due > 0 ? plural(dict.tiles.due, due) : dict.tiles.upToDate}</span>
        </Link>
        {phraseCount && (
          <Link href={`${home}/phrases`} className="tile">
            <span className="tile-icon">💬</span>
            <strong>{dict.phrases.title}</strong>
            <span className="tile-sub">{fill(dict.tiles.count, { done: phraseCount.learned, total: phraseCount.total })}</span>
          </Link>
        )}
      </nav>
    </main>
  );
}
