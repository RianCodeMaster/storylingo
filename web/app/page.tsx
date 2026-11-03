"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countDue } from "@/lib/review";
import { ensureLearner, supabase } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

export default function Home() {
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [due, setDue] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLearner();
      setDue(await countDue());
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
      {due > 0 && (
        <Link href="/review" className="card review-banner">
          <strong>🔁 {due} {due === 1 ? "woord" : "woorden"} om te herhalen</strong>
          <span className="muted">Even herhalen voordat je een nieuw verhaal begint.</span>
        </Link>
      )}
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
