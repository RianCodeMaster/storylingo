"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Player from "@/components/Player";
import { useI18n } from "@/lib/i18n";
import { storyLimitReached, tierOf, usageToday } from "@/lib/plus";
import { ownedProducts, plusOf } from "@/lib/products";
import { loadStory, StoryUnavailable } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { Story } from "@/lib/types";
import { Upsell } from "./Upsell";

export default function StoryLoader() {
  const { id } = useParams<{ id: string }>();
  const { lang, dict, fill, home, edition } = useI18n();
  const [ready, setReady] = useState<{ story: Story; userId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [tomorrow, setTomorrow] = useState(false);
  const [round, setRound] = useState(0); // a new key starts the story from the beginning

  useEffect(() => {
    (async () => {
      const userId = await ensureLearner(lang);
      const [story, owned, usage] = await Promise.all([loadStory(id, lang), ownedProducts(), usageToday()]);
      // A new story while today's free one is used (the database would refuse it too): offer Plus instead.
      if (!story.product && !usage.startedEver.has(story.id) && storyLimitReached(tierOf(edition, owned), usage)) {
        return setTomorrow(true);
      }
      setReady({ story, userId });
    })().catch((e) => (e instanceof StoryUnavailable ? setUnavailable(true) : setError(String(e.message ?? e))));
  }, [id, lang, edition]);

  if (unavailable || tomorrow) {
    return (
      <main>
        {tomorrow ? (
          <Upsell plus={plusOf(edition)} line={dict.plus.storyToday} />
        ) : (
          <>
            <p className="card">{dict.story.unavailable}</p>
            <Upsell plus={plusOf(edition)} line={dict.plus.locked} small />
          </>
        )}
        <Link className="cta" href={home}>
          {dict.nav.home}
        </Link>
      </main>
    );
  }
  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!ready) return <main><p className="muted">{dict.story.loading}</p></main>;
  return <Player key={round} {...ready} onRestart={() => setRound((r) => r + 1)} />;
}
