"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Player from "@/components/Player";
import { useI18n } from "@/lib/i18n";
import { loadStory } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { Story } from "@/lib/types";

export default function StoryLoader() {
  const { id } = useParams<{ id: string }>();
  const { lang, dict, fill } = useI18n();
  const [ready, setReady] = useState<{ story: Story; userId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const userId = await ensureLearner(lang);
      const story = await loadStory(id, lang);
      setReady({ story, userId });
    })().catch((e) => setError(String(e.message ?? e)));
  }, [id, lang]);

  if (error) return <main><p className="card">{fill(dict.common.error, { error })}</p></main>;
  if (!ready) return <main><p className="muted">{dict.story.loading}</p></main>;
  return <Player {...ready} />;
}
