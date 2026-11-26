"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDevActions } from "@/lib/devtools";
import { getEnrollment } from "@/lib/enrollment";
import { useI18n } from "@/lib/i18n";
import {
  isTopic, learnedPhrases, loadPhrases, type PhraseCard, phraseProgress, type PhraseProgress, phraseTotal,
  type Section, type Topic, TOPICS, topicTotals,
} from "@/lib/phrases";
import { type Tier, tierOf, type Usage, usageToday } from "@/lib/plus";
import { ownedProducts } from "@/lib/products";
import { countDue, loadStates } from "@/lib/review";
import { type Grade, NEW_ROW } from "@/lib/srs";
import { narrate, stopSpeaking } from "@/lib/speech";
import { ensureLearner, supabase } from "@/lib/supabase";
import { GRADES, Waiting } from "./Review";
import TopBar from "./TopBar";
import { Upsell } from "./Upsell";
import { useRound } from "./useRound";

const BATCH = 10;
// As many new cards a day as the learner wants, but every new card brings reviews in the days after:
// from this many on, the page says so, so a learner who wants a fast pace chooses it knowingly.
const MANY_NEW = 20;
const DIRECTION_KEY = "storylingo.phraseDirection";

/** understand: hear and read the phrase, recall its meaning. say: read the meaning, say the phrase, then hear it. */
type Direction = "understand" | "say";

/**
 * Ten phrases (or words) as flash cards: the answer stays hidden until the learner has tried, then they grade themselves
 * (didn't know / unsure / knew it), the same three answers as the daily review. Recalling before seeing the answer
 * sticks far better than recognising it (the testing effect). A card you didn't know comes back in this round, but only
 * after a few other cards and at least a minute later (lib/srs.ts); the rest comes back in the review, minutes and
 * then days later, next to the story words.
 */
function Practice({
  batch, lang, direction, section, onDone,
}: { batch: PhraseCard[]; lang: string; direction: Direction; section: Section; onDone: () => void }) {
  const { dict, fill, lang: base } = useI18n();
  const T = section === "words" ? dict.vocab : dict.phrases;
  const [userId, setUserId] = useState<string | null>(null);
  const [cards] = useState(() => batch.map((p) => ({ ...p, srs: p.srs ?? NEW_ROW })));
  const [revealed, setRevealed] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const round = useRound(cards, userId);
  const card = round.current;

  useEffect(() => {
    ensureLearner(base).then(setUserId).catch((e) => setError(e.message));
  }, [base]);

  // Understanding starts with hearing; saying hears the phrase only as the answer.
  useEffect(() => {
    if (card && direction === "understand") narrate(card.audioUrl, card.text, lang);
    return stopSpeaking;
  }, [card, direction, lang]);

  function reveal() {
    if (!card) return;
    setRevealed(true);
    if (direction === "say") narrate(card.audioUrl, card.text, lang);
  }

  function grade(g: Grade) {
    round.answer(g);
    setRevealed(false);
  }

  const shownError = error ?? round.error;
  if (shownError) return <p className="card">{fill(dict.common.error, { error: shownError })}</p>;

  if (round.done || stopped) {
    return (
      <div className="card">
        <h1>{dict.review.done}</h1>
        <p className="story-text">{fill(dict.review.tally, round.tally)}</p>
        <p className="muted">{T.done}</p>
        <button className="primary" onClick={onDone}>
          {T.back}
        </button>
      </div>
    );
  }

  if (!card) return <Waiting ms={round.waiting ?? 0} onStop={() => setStopped(true)} />;

  const phrase = (
    <>
      {/* As the answer (say), the phrase stands out in the edition's color. */}
      <p className={direction === "say" ? "review-word answer" : "review-word"} dir="ltr">
        {card.text}
      </p>
      <button onClick={() => narrate(card.audioUrl, card.text, lang)}>{dict.common.again}</button>
    </>
  );
  const meaning = <p className={direction === "say" ? "review-word" : "sheet-gloss"}>{card.meaning}</p>;
  const total = round.answered + round.left;

  return (
    <>
      <div className="progress">
        <div style={{ width: `${(round.answered / total) * 100}%` }} />
      </div>
      <span className="badge">{fill(T.card, { n: round.answered + 1, total })}</span>
      <p className="muted">{direction === "understand" ? T.hint : T.sayHint}</p>
      <div className="card word-card">
        {direction === "understand" ? phrase : meaning}
        {revealed && (direction === "understand" ? meaning : phrase)}
        {/* A word comes with a short sentence: a word sticks far better in a sentence than on its own. */}
        {revealed && card.example && (
          <p className="word-example">
            <span dir="ltr" lang={lang}>{card.example}</span>
            {card.exampleMeaning && <span className="muted small">{card.exampleMeaning}</span>}
          </p>
        )}
      </div>
      {revealed ? (
        <div className="row">
          {GRADES.map((g) => (
            <button key={g.grade} className={`option ${g.className}`} onClick={() => grade(g.grade)}>
              {dict.review[g.grade]}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={reveal}>
          {direction === "understand" ? dict.review.reveal : T.showAnswer}
        </button>
      )}
    </>
  );
}

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
const rank = (level: string) => LEVEL_ORDER.indexOf(level);

/**
 * A card section of an edition, the phrases or the word trainer: per level how far the learner is, and ten new cards
 * at a time, as many rounds a day as they like (no daily limit; without Plus a level has its free part). It opens at
 * the learner's level, or the nearest level below it that has cards; the other levels are one tap away. When a level
 * is done, the next level and practising again (the learned cards, the least stable first) keep the box from running
 * empty. Both sections work the same; only their texts, their table and their free part differ.
 */
export default function Phrases({ section = "phrases" }: { section?: Section }) {
  const { lang, dict, fill, edition } = useI18n();
  const T = section === "words" ? dict.vocab : dict.phrases;
  const [mine, setMine] = useState<string | null>(null); // the learner's own level in this edition
  const [levels, setLevels] = useState<PhraseProgress>({}); // the levels this section has, with counts
  const [level, setLevel] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("understand");
  const [phrases, setPhrases] = useState<PhraseCard[] | null>(null);
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<PhraseCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tier, setTier] = useState<Tier | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One topic (?topic=health, e.g. from a video about the doctor) or all phrases of the level; per topic its total.
  const [topic, setTopic] = useState<Topic | null>(null);
  const [topics, setTopics] = useState<Partial<Record<Topic, number>>>({});
  const [due, setDue] = useState(0); // review cards waiting: those first, then new ones

  // Open at the learner's level, or the nearest level below it with cards, in the direction chosen last time.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("topic");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, unknown during server render
    if (isTopic(asked)) setTopic(asked);
    try {
      if (localStorage.getItem(DIRECTION_KEY) === "say") setDirection("say");
    } catch {}
    (async () => {
      await ensureLearner(lang);
      const [enrolled, progress] = await Promise.all([getEnrollment(edition.slug), phraseProgress(edition.target, section)]);
      const own = enrolled?.level ?? "A1";
      const have = Object.keys(progress).sort((a, b) => rank(a) - rank(b));
      const below = have.filter((l) => rank(l) <= rank(own));
      setMine(own);
      setLevels(progress);
      setLevel(below.at(-1) ?? have[0] ?? null);
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition.slug, edition.target, section]);

  function chooseDirection(d: Direction) {
    setDirection(d);
    try {
      localStorage.setItem(DIRECTION_KEY, d);
    } catch {}
  }

  function chooseLevel(l: string) {
    setPhrases(null);
    setLevel(l);
  }

  // Test tools (development only): practise this level's cards again from scratch.
  useDevActions([
    {
      label: section === "words" ? "Woorden van dit niveau weer als nieuw" : "Zinnen van dit niveau weer als nieuw",
      run: async () => {
        const ids = phrases?.map((p) => p.lexemeId) ?? [];
        if (ids.length) await supabase().from("user_lexeme_state").delete().in("lexeme_id", ids);
        window.location.reload();
      },
    },
  ]);

  useEffect(() => {
    if (!level || batch) return;
    (async () => {
      // The database hands out only the free part without Plus; the total says how many there are in all.
      const [list, done, all, perTopic, owned, today, waiting, progress] = await Promise.all([
        loadPhrases(edition, level, topic, section), learnedPhrases(edition.target, section),
        phraseTotal(edition.target, level, section), topicTotals(edition.target, level, section), ownedProducts(),
        usageToday(edition.target), countDue(edition.target), phraseProgress(edition.target, section),
      ]);
      setDue(waiting);
      setPhrases(list);
      setLearned(done);
      setTotal(topic ? (perTopic[topic] ?? list.length) : all);
      setTopics(perTopic);
      setTier(tierOf(edition, owned));
      setUsage(today);
      setLevels(progress);
    })().catch((e) => setError(String(e.message ?? e)));
  }, [level, edition, batch, topic, section]);

  /** Switch topic (or back to all), and keep it in the address so a reload or a shared link shows the same. */
  function chooseTopic(t: Topic | null) {
    setPhrases(null);
    setTopic(t);
    const url = new URL(window.location.href);
    if (t) url.searchParams.set("topic", t);
    else url.searchParams.delete("topic");
    window.history.replaceState(null, "", url);
  }

  /** Practise learned cards again, before they are due: the least stable first (FSRS takes the early review in). */
  async function practiseAgain() {
    try {
      const known = (phrases ?? []).filter((p) => learned.has(p.lexemeId));
      const states = await loadStates(known.map((p) => p.lexemeId));
      const ordered = known
        .map((p) => ({ ...p, srs: states.get(p.lexemeId) }))
        .sort((a, b) => (a.srs?.stability ?? 0) - (b.srs?.stability ?? 0));
      setBatch(ordered.slice(0, BATCH));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (batch) {
    return (
      <main>
        <TopBar title={T.title} />
        <Practice batch={batch} lang={edition.target} direction={direction} section={section} onDone={() => setBatch(null)} />
      </main>
    );
  }

  const fresh = phrases?.filter((p) => !learned.has(p.lexemeId)) ?? [];
  const done = (phrases?.length ?? 0) - fresh.length;
  // Without Plus a level has its free part (the rest is locked); there is no limit per day.
  const limits = tier?.limits;
  const usedToday = section === "words" ? usage?.newWords : usage?.newPhrases;
  const upsellLevel = section === "words" ? dict.plus.wordsLevel : dict.plus.phrasesLevel;
  const lockedPart = !!limits && total > (phrases?.length ?? 0);
  const order = Object.keys(levels).sort((a, b) => rank(a) - rank(b));
  const next = level ? order.find((l) => rank(l) > rank(level)) : undefined;
  return (
    <main>
      <TopBar title={topic ? `${T.title}: ${dict.phrases.topics[topic]}` : T.title} />
      <p className="muted">{T.intro}</p>
      {/* The levels this section has, each with how far the learner is; their own level has a star. */}
      {order.length > 0 && (
        <nav className="topic-chips" aria-label={dict.level.yours}>
          {order.map((l) => (
            <button key={l} className={l === level ? "chosen-level" : ""} onClick={() => chooseLevel(l)}>
              {l === mine ? "★ " : ""}
              {l} <span className="small muted">{levels[l].learned}/{levels[l].total}</span>
            </button>
          ))}
        </nav>
      )}
      {/* Topics of daily life: the ones this level has, as chips; "all" goes back to the whole level. */}
      {Object.keys(topics).length > 0 && (
        <nav className="topic-chips" aria-label={dict.phrases.topicsLabel}>
          <button className={topic ? "" : "chosen-level"} onClick={() => chooseTopic(null)}>
            {dict.phrases.allTopics}
          </button>
          {TOPICS.filter((t) => topics[t]).map((t) => (
            <button key={t} className={t === topic ? "chosen-level" : ""} onClick={() => chooseTopic(t)}>
              {dict.phrases.topics[t]}
            </button>
          ))}
        </nav>
      )}
      <div className="row">
        {(["understand", "say"] as const).map((d) => (
          <button key={d} className={d === direction ? "chosen-level" : ""} onClick={() => chooseDirection(d)}>
            {T[d]}
          </button>
        ))}
      </div>
      {!phrases || !tier ? (
        <p className="muted">{dict.common.loading}</p>
      ) : (
        <div className="card">
          {/* Against everything the level has (also what is behind Plus): the whole list, not the free part. */}
          <strong>{fill(T.progress, { learned: done, total: Math.max(total, phrases.length) })}</strong>
          <div className="progress">
            <div style={{ width: `${total ? (100 * done) / total : 0}%` }} />
          </div>
          {/* Review first: what is due today sticks only if it is repeated now; new cards can wait. */}
          {due > 0 && (
            <Link href={`/${edition.slug}/review`} className="card nudge">
              🔁 {fill(dict.review.first, { n: due })} <span className="arrow">→</span>
            </Link>
          )}
          {usedToday !== undefined && usedToday >= MANY_NEW && (
            <p className="muted small">{fill(dict.review.manyNew, { n: usedToday })}</p>
          )}
          {fresh.length > 0 ? (
            <button className="primary" onClick={() => setBatch(fresh.slice(0, BATCH))}>
              {fresh.length < BATCH ? T.more : T.learn}
            </button>
          ) : lockedPart ? (
            <Upsell plus={tier.plus} line={fill(upsellLevel, { free: phrases.length, total })} />
          ) : (
            <p className="muted">{T.allLearned}</p>
          )}
          {lockedPart && fresh.length > 0 && (
            <Upsell plus={tier.plus} line={fill(upsellLevel, { free: phrases.length, total })} small />
          )}
          {/* The box never runs empty: the next level, and practising what was learned again. */}
          {fresh.length === 0 && next && (
            <button className="primary" onClick={() => chooseLevel(next)}>
              {fill(dict.level.readyButton, { level: next })} <span className="arrow">→</span>
            </button>
          )}
          {done > 0 && <button onClick={() => void practiseAgain()}>🔁 {dict.review.practiseAgain}</button>}
        </div>
      )}
    </main>
  );
}
