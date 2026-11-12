"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Player from "@/components/Player";
import { useI18n } from "@/lib/i18n";
import { loadStory, StoryUnavailable } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { Story } from "@/lib/types";

export default function StoryLoader() {
  const { id } = useParams<{ id: string }>();
  const { lang, dict, fill, home } = useI18n();
  const [ready, setReady] = useState<{ story: Story; userId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [round, setRound] = useState(0); // a new key starts the story from the beginning

  useEffect(() => {
    (async () => {
      const userId = await ensureLearner(lang);
      const story = await loadStory(id, lang);
      setReady({ story, userId });
    })().catch((e) => (e instanceof StoryUnavailable ? setUnavailable(true) : setError(String(e.message ?? e))));
  }, [id, lang]);

  if (unavailable) {
    return (
      <main>
        <p className="card">{dict.story.unavailable}</p>
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
