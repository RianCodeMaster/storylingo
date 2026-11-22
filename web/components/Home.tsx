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
const WIZARD_STEPS: readonly string[] = ["language", "level", "start"];
const asStep = (s: string | null): WizardStep | null => (s && WIZARD_STEPS.includes(s) ? (s as WizardStep) : null);

/** One answer of the wizard as a card: tapping selects it (a dot shows which); Next goes on. */
function Card(props: { on: boolean; onPick: () => void; badge?: string; children: React.ReactNode }) {
  return (
    <button role="radio" aria-checked={props.on} className={props.on ? "choice selected" : "choice"} onClick={props.onPick}>
      {props.badge && <span className="lang-badge">{props.badge}</span>}
      <span className="choice-body">{props.children}</span>
      <span className="radio-dot" aria-hidden />
    </button>
  );
}

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
  // The wizard's answers until Next: the app's language (an edition) and what to start with (story, phrases, track:x).
  const [langPick, setLangPick] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const router = useRouter();

  /** Another wizard screen, as a step in the browser's history: the phone's back button returns to the one before. */
  function goToStep(s: WizardStep) {
    setStep(s);
    const url = new URL(window.location.href);
    url.searchParams.set("step", s);
    window.history.pushState(null, "", url);
  }

  // Back (the bar's button or the phone's): the step in the address.
  useEffect(() => {
    const onPop = () => setStep(asStep(new URLSearchParams(window.location.search).get("step")));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // This language in every base language it is taught in (almanya, duits, german): the wizard's first question.
  const family = siblingsOf(edition);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
    setGoal({ story: params.get("story"), start: params.get("start"), topic: params.get("topic") });
    setStep(asStep(params.get("step")));
    // A level page's "start" (/almanya/level/a2 → ?step=level&level=A2): that level already chosen.
    const askedLevel = params.get("level")?.toUpperCase();
    if (askedLevel && (LEVELS as readonly string[]).includes(askedLevel)) setChoice(askedLevel);
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
    // The first visit is a wizard: one question per screen, the answer chosen by tapping a card (nothing jumps
    // away), and always the same bar at the bottom: Back and Next (on the last screen: Start). Steps: the app's
    // language (when this language is also taught in another one), the level (when there is a choice), what to start
    // with. Each step is in the address (?step=…), so the phone's back button goes back one step.
    const steps: WizardStep[] = [
      ...(family.length > 1 ? (["language"] as const) : []),
      ...(levels.length > 1 ? (["level"] as const) : []),
      "start",
    ];
    const current: WizardStep = step && steps.includes(step) ? step : steps[0];
    const at = steps.indexOf(current);
    const tracks = track ? [] : edition.tracks.filter((t) => trackProducts(edition, t.slug, owned).length > 0);
    const hasPhrases = Object.keys(phrases).length > 0;
    // What the last screen has chosen: what the video showed, else the story.
    const picked = pick ?? (phrasesFirst ? "phrases" : "story");
    const storyHref = first ? `${home}/story/${first.id}` : null;
    const phrasesHref = topic ? `${home}/phrases?topic=${topic}` : `${home}/phrases`;

    /** Next: the next screen; on the language screen another language opens that edition at its level screen. */
    function onNext() {
      if (current === "language" && langPick && langPick !== edition.slug) {
        const url = new URL(window.location.href);
        url.pathname = `/${langPick}`;
        url.searchParams.set("step", "level");
        // A full load on purpose: another edition has its own layout, language and direction.
        window.location.assign(url);
      } else if (current !== "start") {
        goToStep(steps[at + 1]);
      } else if (picked === "phrases") {
        void begin(level, phrasesHref);
      } else if (picked.startsWith("track:")) {
        router.push(`${home}/${picked.slice(6)}?step=start`);
      } else {
        void begin(level, storyHref);
      }
    }

    return (
      <main className="welcome wizard">
        {/* Only the name and icon of the channel (a video's viewer sees they are in the right place) and the
            language of the app: one question per screen, nothing else. */}
        <div className="welcome-top">
          <p className="edition-name brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
            <img src="/icon.svg" alt="" className="brand-icon" />
            Qissio
          </p>
          <LanguageSwitch keepQuery />
        </div>
        {steps.length > 1 && (
          <div className="wizard-progress" aria-label={fill(dict.wizard.progress, { n: at + 1, total: steps.length })}>
            <div className="wizard-progress-bar">
              <div style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
            </div>
            {/* In words ("Step 1 of 3"), so right-to-left languages do not turn "1 / 3" around. */}
            <span>{fill(dict.wizard.progress, { n: at + 1, total: steps.length })}</span>
          </div>
        )}
        {at === 0 && <p className="tagline-small">{track?.tagline ?? edition.tagline}</p>}
        {stories.length === 0 ? (
          <p className="card">{dict.welcome.soon}</p>
        ) : current === "language" ? (
          <section className="choices" role="radiogroup" aria-label={dict.language.title}>
            <h1 className="wizard-question">{dict.language.title}</h1>
            {family.map((e) => (
              <Card key={e.slug} on={(langPick ?? edition.slug) === e.slug} onPick={() => setLangPick(e.slug)} badge={e.base.toUpperCase()}>
                <strong lang={e.base} dir={direction(e.base)}>
                  {LANGUAGES[e.base]?.name ?? e.base}
                </strong>
              </Card>
            ))}
          </section>
        ) : current === "level" ? (
          <section className="choices" role="radiogroup" aria-label={dict.level.question}>
            <h1 className="wizard-question">{dict.level.question}</h1>
            {levels.map((l) => (
              <Card key={l} on={l === level} onPick={() => setChoice(l)} badge={l}>
                <strong>{dict.level.options[l]}</strong>
              </Card>
            ))}
          </section>
        ) : (
          // What to start with: the story, the phrases (of the video's topic), a track with its own course. Whoever
          // came from a video finds what it showed chosen, and on top.
          <section className={phrasesFirst ? "choices phrases-first" : "choices"} role="radiogroup" aria-label={dict.welcome.pick}>
            <h1 className="wizard-question choices-title">{dict.welcome.pick}</h1>
            <span className="choice-story">
              <Card on={picked === "story"} onPick={() => setPick("story")}>
                <strong>📖 {first && first === fromVideo ? dict.welcome.fromVideo : dict.welcome.storyTitle}</strong>
                {first && first === fromVideo && (
                  <span className="choice-name">
                    <bdi>{first.title}</bdi>
                  </span>
                )}
                <span className="choice-line">{dict.wizard.storyShort}</span>
              </Card>
            </span>
            {hasPhrases && (
              <span className="choice-phrases">
                <Card on={picked === "phrases"} onPick={() => setPick("phrases")}>
                  <strong>
                    💬 {topic ? fill(dict.welcome.phrasesTopic, { topic: dict.phrases.topics[topic] }) : dict.welcome.phrasesTitle}
                  </strong>
                  <span className="choice-line">{dict.wizard.phrasesShort}</span>
                </Card>
              </span>
            )}
            {tracks.map((t) => (
              <Card key={t.slug} on={picked === `track:${t.slug}`} onPick={() => setPick(`track:${t.slug}`)}>
                <strong>🎓 {t.tagline}</strong>
              </Card>
            ))}
          </section>
        )}
        {/* What the track's ad promised: a course that is coming (leave an e-mail) or one for sale. */}
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
        {/* Always the same two buttons at the bottom of the screen. */}
        <div className="wizard-bar">
          {at > 0 ? (
            <button className="wizard-back" onClick={() => window.history.back()}>
              {dict.wizard.back}
            </button>
          ) : (
            <span />
          )}
          <button className="primary wizard-next" disabled={busy || stories.length === 0} onClick={onNext}>
            {current === "start" ? dict.wizard.begin : dict.wizard.next}
          </button>
        </div>
        {current === "start" && <p className="muted small">{dict.welcome.free}</p>}
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
      {/* Why the method works, for whoever wants to know: here, not in the wizard (one question per screen there). */}
      <WhyItWorks />
    </main>
  );
}
