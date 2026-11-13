"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEnrollment, type Level } from "@/lib/enrollment";
import { useI18n } from "@/lib/i18n";
import { isLocked, type Tier, tierOf } from "@/lib/plus";
import { ownedProducts } from "@/lib/products";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";
import TopBar from "./TopBar";
import { Upsell } from "./Upsell";

/**
 * Stories as rows with their picture and summary; a finished one is marked and can be played again. A locked one
 * (`lockedHref` gives where it leads: Plus or its pack) shows a lock and opens that page instead of the story.
 */
export function StoryRows({
  stories,
  finished,
  lockedHref,
}: {
  stories: StoryCard[];
  finished: Set<string>;
  lockedHref?: (s: StoryCard) => string | null;
}) {
  const { dict, home } = useI18n();
  return stories.map((s) => {
    const lock = lockedHref?.(s) ?? null;
    return (
    <Link key={s.id} href={lock ?? `${home}/story/${s.id}`} className={`story-row${lock ? " story-row-locked" : ""}`}>
      {s.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
        <img src={s.cover} alt="" />
      ) : (
        <span className="story-row-blank">📖</span>
      )}
      <div>
        <strong dir="ltr">{lock && "🔒 "}{s.title}</strong>
        {s.summary && <span className="muted small">{s.summary}</span>}
        {finished.has(s.id) && <span className="done-mark">{dict.home.finished}</span>}
      </div>
    </Link>
    );
  });
}

/** Every story at the learner's level, with its picture; a finished one is marked and can be played again. */
export default function Stories() {
  const { lang, dict, fill, edition, home } = useI18n();
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLearner(lang);
      const [enrolled, list, done, packs] = await Promise.all([
        getEnrollment(edition.slug), listStories(edition), finishedStories(), ownedProducts(),
      ]);
      setOwned(packs);
      setTier(tierOf(edition, packs));
      const mine = enrolled?.level ?? list[0]?.cefr_level ?? "A1";
      setLevel(mine);
      setFinished(done);
      setStories(list.filter((s) => s.cefr_level === mine));
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang, edition]);

  return (
    <main>
      <TopBar title={dict.tiles.stories} />
      {error ? (
        <p className="card">{fill(dict.common.error, { error })}</p>
      ) : !stories || !level ? (
        <p className="muted">{dict.common.loading}</p>
      ) : (
        <>
          <span className="badge">
            {dict.level.yours}: {level} · {dict.level.names[level as Level]}
          </span>
          {stories.length === 0 && <p className="card">{fill(dict.level.noneYet, { level })}</p>}
          <StoryRows
            stories={stories}
            finished={finished}
            lockedHref={(s) =>
              tier && isLocked(s, tier, owned) ? `${home}/p/${s.product ?? tier.plus?.slug ?? ""}` : null
            }
          />
          {tier && stories.some((s) => isLocked(s, tier, owned)) && <Upsell plus={tier.plus} line={dict.plus.lockedLevel} small />}
        </>
      )}
    </main>
  );
}
