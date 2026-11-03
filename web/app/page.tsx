"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureLearner, supabase } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

export default function Home() {
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLearner();
      const { data, error } = await supabase()
        .from("stories")
        .select("id, title, summary, cefr_level, language_code")
        .order("published_at", { ascending: false });
      if (error) throw error;
      setStories(data);
    })().catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <main>
      <h1>StoryLingo</h1>
      <p className="muted">Gekke verhalen, grote gebaren, heel veel vragen.</p>
      {error && <p className="card">Er ging iets mis: {error}</p>}
      {!stories && !error && <p className="muted">Laden…</p>}
      {stories?.length === 0 && <p className="muted">Nog geen gepubliceerde verhalen.</p>}
      {stories?.map((s) => (
        <Link key={s.id} href={`/story/${s.id}`} className="card">
          <span className="badge">
            {s.language_code.toUpperCase()} {s.cefr_level}
          </span>
          <strong>{s.title}</strong>
          {s.summary && <span className="muted">{s.summary}</span>}
        </Link>
      ))}
    </main>
  );
}
