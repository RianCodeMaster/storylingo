"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Player from "@/components/Player";
import { loadStory } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { Story } from "@/lib/types";

export default function StoryLoader() {
  const { id } = useParams<{ id: string }>();
  const [ready, setReady] = useState<{ story: Story; userId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const userId = await ensureLearner();
      const story = await loadStory(id);
      setReady({ story, userId });
    })().catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  if (error) return <main><p className="card">Er ging iets mis: {error}</p></main>;
  if (!ready) return <main><p className="muted">Verhaal laden…</p></main>;
  return <Player {...ready} />;
}
