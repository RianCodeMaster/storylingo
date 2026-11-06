"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { LOCALE_NAMES, LOCALES, rememberLocale } from "@/lib/locales";
import { countDue } from "@/lib/review";
import { finishedStories, listStories } from "@/lib/story";
import { ensureLearner } from "@/lib/supabase";
import type { StoryCard } from "@/lib/types";

export default function Home() {
  const { lang, dict, fill, plural } = useI18n();
  const [stories, setStories] = useState<StoryCard[] | null>(null);
  const [due, setDue] = useState(0);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureLearner(lang);
      setDue(await countDue());
      setFinished(await finishedStories());
      setStories(await listStories(lang));
    })().catch((e) => setError(String(e.message ?? e)));
  }, [lang]);

  return (
    <main>
      <h1>StoryLingo</h1>
      <p className="muted">{dict.home.tagline}</p>
      <nav className="row languages" aria-label={dict.home.language}>
        {LOCALES.map((code) =>
          code === lang ? (
            <strong key={code}>{LOCALE_NAMES[code]}</strong>
          ) : (
            <Link key={code} href={`/${code}`} lang={code} className="muted" onClick={() => rememberLocale(code)}>
              {LOCALE_NAMES[code]}
            </Link>
          ),
        )}
      </nav>
      {error && <p className="card">{fill(dict.common.error, { error })}</p>}
      {due > 0 && (
        <Link href={`/${lang}/review`} className="card review-banner">
          <strong>{plural(dict.home.due, due)}</strong>
          <span className="muted">{dict.home.dueHint}</span>
        </Link>
      )}
      {!stories && !error && <p className="muted">{dict.common.loading}</p>}
      {stories?.length === 0 && <p className="muted">{dict.home.empty}</p>}
      {stories?.map((s) => (
        <Link key={s.id} href={`/${lang}/story/${s.id}`} className="card">
          <div className="row">
            <span className="badge">
              {s.language_code.toUpperCase()} {s.cefr_level}
            </span>
            {finished.has(s.id) && <span className="muted">{dict.home.finished}</span>}
          </div>
          <strong dir="ltr">{s.title}</strong>
          {s.summary && <span className="muted">{s.summary}</span>}
        </Link>
      ))}
    </main>
  );
}
