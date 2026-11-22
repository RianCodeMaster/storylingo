"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductTile } from "@/components/ProductTile";
import { PlusChip, Upsell } from "@/components/Upsell";
import { Waitlist } from "@/components/Waitlist";
import { currentAccount } from "@/lib/account";
import { arrival, recordVisit } from "@/lib/attribution";
import { useDevActions } from "@/lib/devtools";
import { siblingsOf, trackOf } from "@/lib/editions";
import { direction, LANGUAGES } from "@/lib/locales";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { type Enrollment, getEnrollment, LEVELS, type Level, setLevel } from "@/lib/enrollment";
import { useI18n } from "@/lib/i18n";
import { isTopic, phraseProgress, type PhraseProgress } from "@/lib/phrases";
import { isLocked, storyLimitReached, tierOf, type Usage, usageToday } from "@/lib/plus";
import { ownedProducts, trackProducts, visibleProducts } from "@/lib/products";
import { countDue } from "@/lib/review";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner, supabase } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

const PRINCIPLES = ["input", "bizarre", "body", "picture", "speak", "timing"] as const;

/** The first visit's wizard: the app's language, the level, what to start with. */
type WizardStep = "language" | "level" | "start";

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

/** The track's own tags first (stable otherwise): a niche meets its own stories before the rest. */
const preferring = (stories: StoryCard[], prefer: string[]) =>
  prefer.length ? [...stories].sort((a, b) => +!a.tags.some((t) => prefer.includes(t)) - +!b.tags.some((t) => prefer.includes(t))) : stories;

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
 *
 * Through a track (/almanya/b1-examen) the welcome speaks to that niche: its own lines, its start level, its stories
 * first. The learner keeps that track afterwards (it is stored with their enrollment), so its stories stay first
 * and a course it promises stays on the start screen.
 */
export function Home({ trackSlug = null }: { trackSlug?: string | null }) {
  const { lang, dict, fill, plural, edition, home } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null | undefined>(undefined);
  const [choice, setChoice] = useState<string | null>(null);
  const [due, setDue] = useState(0);
  const [phrases, setPhrases] = useState<PhraseProgress>({});
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [anonymous, setAnonymous] = useState(true);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What the video showed, from its code (proxy.ts, lib/video-codes.json): its own story, or the phrases first.
  const [goal, setGoal] = useState<{ story: string | null; start: string | null; topic: string | null }>({
    story: null, start: null, topic: null,
  });
  // The wizard's step (null: its first). Coming from another language's wizard (?step=level) skips the language.
  const [step, setStep] = useState<WizardStep | null>(null);
  const router = useRouter();
  // This language in every base language it is taught in (almanya, duits, german): the wizard's first question.
  const family = siblingsOf(edition);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
    setGoal({ story: params.get("story"), start: params.get("start"), topic: params.get("topic") });
    const asked = params.get("step");
    if (asked === "level" || asked === "start") setStep(asked);
    (async () => {
      const learner = await ensureLearner(lang);
      setUserId(learner);
      const [enrolled, dueCount, done, list, phraseCounts, mine, today] = await Promise.all([
        getEnrollment(edition.slug), countDue(edition.target), finishedStories(), listStories(edition),
        phraseProgress(edition.target), ownedProducts(), usageToday(),
      ]);
      setOwned(mine);
      setUsage(today);
      setAnonymous((await currentAccount())?.anonymous ?? true);
      if (!enrolled) void recordVisit(learner, edition.slug, arrival(edition.slug, trackSlug));
      setPhrases(phraseCounts);
      setDue(dueCount);
      setFinished(done);
      setStories(list);
      setEnrollment(enrolled);
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition, trackSlug]);

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

  /**
   * A welcome block: enrol at the chosen level first and only then open the page, so the page already knows the
   * level (the phrases read it on arrival). Without a page (no story yet), the start screen follows from enrolling.
   */
  async function begin(level: string, href: string | null) {
    setBusy(true);
    try {
      await choose(level);
      if (href) router.push(href);
    } finally {
      setBusy(false);
    }
  }

  /** The first choice of a level also keeps where the learner came in; later changes only move the level. */
  async function choose(level: string) {
    if (!userId) return null;
    const enrolled = await setLevel(userId, edition.slug, level, enrollment ? undefined : arrival(edition.slug, trackSlug));
    setEnrollment(enrolled);
    return enrolled;
  }

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!stories || enrollment === undefined || !usage) return <main><p className="muted">{dict.common.loading}</p></main>;

  // Plus: what is locked for this learner, and whether today's free new story is used.
  const tier = tierOf(edition, owned);
  const locked = (s: StoryCard) => isLocked(s, tier, owned);

  // The levels this edition offers (content/editions/<slug>.yaml), else those it has stories for.
  const offered = LEVELS.filter((l) => edition.stories.levels.includes(l));
  const levels = offered.length ? offered : levelsOf(stories);
  const levelName = (l: string) => `${l} · ${dict.level.names[l as Level]}`;

  if (!enrollment) {
    const track = trackOf(edition, trackSlug);
    // A story video's own story (when it is open to this learner): its level is the one offered first.
    const fromVideo = stories.find((s) => s.slug === goal.story && !locked(s) && levels.includes(s.cefr_level as Level));
    const trackLevel = track?.level && levels.includes(track.level as Level) ? track.level : null;
    const start = fromVideo?.cefr_level ?? trackLevel ?? levels[0];
    const level = choice ?? start ?? "A1";
    // Straight into a story at the chosen level: the video's own while its level is chosen, else the track's own first.
    const first =
      fromVideo && fromVideo.cefr_level === level
        ? fromVideo
        : preferring(stories, track?.prefer ?? []).find((s) => s.cefr_level === level && !locked(s));
    const phrasesFirst = goal.start === "phrases" && Object.keys(phrases).length > 0;
    // A phrase video about one topic (the doctor) leads to that topic's phrases.
    const topic = isTopic(goal.topic) ? goal.topic : null;
    // The first visit is a wizard of up to three one-tap steps: the app's language (only when this language is also
    // taught in another one), the level (only when there is a choice), then what to start with. A step the visitor
    // already answered elsewhere (?step=level after switching language) is skipped.
    const steps: WizardStep[] = [
      ...(family.length > 1 ? (["language"] as const) : []),
      ...(levels.length > 1 ? (["level"] as const) : []),
      "start",
    ];
    const current: WizardStep = step && steps.includes(step) ? step : steps[0];
    const at = steps.indexOf(current);
    const next = () => setStep(steps[Math.min(at + 1, steps.length - 1)]);

    /** Another language: that edition's wizard, at the level step, with the campaign and video goal along. */
    function otherLanguage(slug: string) {
      const url = new URL(window.location.href);
      url.pathname = `/${slug}`;
      url.searchParams.set("step", "level");
      // A full load on purpose: another edition has its own layout, language and direction.
      window.location.assign(url);
    }

    return (
      <main className="welcome">
        {/* Whoever comes from a video should see at once that they are in the right place: the same name and icon
            as the channel. Top right the language of the app, to put a wrong guess right at any moment. */}
        <div className="welcome-top">
          <p className="edition-name brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
            <img src="/icon.svg" alt="" className="brand-icon" />
            Qissio · {edition.name}
          </p>
          <LanguageSwitch keepQuery />
        </div>
        <h1 className="tagline">{track?.tagline ?? edition.tagline}</h1>
        {at === 0 && <p className="intro">{track?.intro ?? edition.intro}</p>}
        {steps.length > 1 && (
          <div className="wizard-dots" aria-label={fill(dict.wizard.progress, { n: at + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <span key={s} className={i <= at ? "on" : ""} />
            ))}
          </div>
        )}
        {stories.length === 0 ? (
          <p className="card">{dict.welcome.soon}</p>
        ) : current === "language" ? (
          <section className="choices" aria-label={dict.language.title}>
            <h2 className="wizard-step-title">🌐 {dict.language.title}</h2>
            {family.map((e) => (
              <button
                key={e.slug}
                className={e.slug === edition.slug ? "choice choice-main" : "choice"}
                onClick={() => (e.slug === edition.slug ? next() : otherLanguage(e.slug))}
              >
                <span className="lang-badge">{e.base.toUpperCase()}</span>
                <span className="choice-body">
                  <strong lang={e.base} dir={direction(e.base)}>
                    {LANGUAGES[e.base]?.name ?? e.base}
                  </strong>
                  <span className="choice-line" lang={e.base} dir={direction(e.base)}>
                    {e.name}
                  </span>
                </span>
                <span className="arrow">{e.slug === edition.slug ? "✓" : "→"}</span>
              </button>
            ))}
          </section>
        ) : current === "level" ? (
          <section className="choices" aria-label={dict.level.question}>
            <h2 className="wizard-step-title">📊 {dict.level.question}</h2>
            {levels.map((l) => (
              <button
                key={l}
                className={l === level ? "choice choice-main" : "choice"}
                onClick={() => {
                  setChoice(l);
                  next();
                }}
              >
                <span className="lang-badge">{l}</span>
                <span className="choice-body">
                  <strong>{dict.level.options[l]}</strong>
                </span>
                <span className="arrow">→</span>
              </button>
            ))}
            <p className="muted small">{dict.level.onlyYours}</p>
          </section>
        ) : (
          <>
            {/* Blocks instead of one button: each says what happens when you tap it and how long it takes, so nobody
                lands in something they did not choose. The story comes first (the heart of the app); the phrases are
                what the phrase videos promise; a track with its own course (the B1 exam) gets its own block. */}
            {/* Whoever came from a video sees what it showed on top: a phrase video puts the phrases first, a story
                video offers that very story (with its title). */}
            <section className={phrasesFirst ? "choices phrases-first" : "choices"} aria-label={dict.welcome.pick}>
              <h2 className="choices-title wizard-step-title">🎯 {dict.welcome.pick}</h2>
              <button
                className={phrasesFirst ? "choice choice-story" : "choice choice-story choice-main"}
                disabled={busy}
                onClick={() => void begin(level, first ? `${home}/story/${first.id}` : null)}
              >
                {first?.cover && (
                  // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
                  <img src={first.cover} alt="" className="choice-img" />
                )}
                <span className="choice-body">
                  <strong>📖 {first && first === fromVideo ? dict.welcome.fromVideo : dict.welcome.storyTitle}</strong>
                  {first && first === fromVideo && (
                    <span className="choice-name">
                      <bdi>{first.title}</bdi>
                    </span>
                  )}
                  <span className="choice-line">{dict.welcome.storyLine}</span>
                </span>
                <span className="arrow">→</span>
              </button>
              {Object.keys(phrases).length > 0 && (
                <button
                  className={phrasesFirst ? "choice choice-phrases choice-main" : "choice choice-phrases"}
                  disabled={busy}
                  onClick={() => void begin(level, topic ? `${home}/phrases?topic=${topic}` : `${home}/phrases`)}
                >
                  <span className="choice-body">
                    <strong>
                      💬 {topic ? fill(dict.welcome.phrasesTopic, { topic: dict.phrases.topics[topic] }) : dict.welcome.phrasesTitle}
                    </strong>
                    <span className="choice-line">{topic ? dict.welcome.phrasesTopicLine : dict.welcome.phrasesLine}</span>
                  </span>
                  <span className="arrow">→</span>
                </button>
              )}
              {!track &&
                edition.tracks
                  .filter((t) => trackProducts(edition, t.slug, owned).length > 0)
                  .map((t) => (
                    <Link key={t.slug} className="choice" href={`${home}/${t.slug}`}>
                      <span className="choice-body">
                        <strong>🎓 {t.tagline}</strong>
                        <span className="choice-line">{t.title}</span>
                      </span>
                      <span className="arrow">→</span>
                    </Link>
                  ))}
            </section>
            <p className="muted small">{dict.welcome.free}</p>
          </>
        )}
        {at > 0 && (
          <button className="link muted" onClick={() => setStep(steps[at - 1])}>
            {dict.wizard.back}
          </button>
        )}
        {/* What the track's ad promised on top: a course that is coming (leave an e-mail) or one for sale. */}
        {current === "start" &&
          track &&
          trackProducts(edition, track.slug, owned).map((p) =>
            p.status === "coming" ? (
              <Waitlist key={p.slug} product={p} track={track.slug} />
            ) : (
              <nav key={p.slug} className="tiles">
                <ProductTile product={p} owned={owned.has(p.slug)} />
              </nav>
            ),
          )}
        <WhyItWorks />
        {current === "start" && stories.length > 1 && (
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
  const track = trackOf(edition, enrollment.track);
  const group = preferring(stories, track?.prefer ?? []).filter((s) => s.cefr_level === mine);
  const done = group.filter((s) => finished.has(s.id)).length;
  const next = group.find((s) => !finished.has(s.id) && !locked(s));
  // A new story while today's free one is used: offer Plus instead (one already started can always be replayed).
  const waitForTomorrow = !!next && !usage.startedEver.has(next.id) && storyLimitReached(tier, usage);
  const lockedLeft = group.some((s) => !finished.has(s.id) && locked(s));
  const higher = levelsOf(stories).find((l) => LEVELS.indexOf(l) > LEVELS.indexOf(mine as Level));

  // The phrases section stops at B1: a higher level practises the B1 phrases.
  const phraseLevel = phrases[mine] ? mine : Object.keys(phrases).sort().at(-1);
  const phraseCount = phraseLevel ? phrases[phraseLevel] : undefined;

  return (
    <main className="dash">
      <header className="dash-head">
        <span className="edition-name">{edition.name}</span>
        <LevelChip levels={levels} mine={mine} name={levelName} onChoose={(l) => void choose(l)} />
        {tier.plus && !tier.has && <PlusChip plus={tier.plus} />}
        {/* Another language of the app: their progress stays with this one, so they are asked first. */}
        <LanguageSwitch warn compact />
        <Link href={`${home}/account`} className="dash-account" aria-label={dict.account.title}>
          👤
        </Link>
      </header>

      {/* One clear next step: the next story at the learner's level (or, past the free part, the way to Plus). */}
      {waitForTomorrow ? (
        <>
          <Upsell plus={tier.plus} line={dict.plus.storyToday} />
          <p className="muted small">{dict.plus.replay}</p>
        </>
      ) : next ? (
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
      ) : lockedLeft ? (
        <Upsell plus={tier.plus} line={dict.plus.lockedLevel} />
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

      {/* Only once a story is finished (they have something to lose), and only while they have no account. */}
      {anonymous && finished.size > 0 && (
        <Link href={`${home}/account`} className="card nudge">
          💾 {dict.account.nudge} <span className="arrow">→</span>
        </Link>
      )}

      {/* Everything else: one tile per part of the app, then the products (what they have, what is offered). */}
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
        {visibleProducts(edition, owned).map((p) => (
          <ProductTile key={p.slug} product={p} owned={owned.has(p.slug)} />
        ))}
      </nav>
    </main>
  );
}
