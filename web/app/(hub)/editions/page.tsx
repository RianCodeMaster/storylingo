import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { EDITIONS, showsEverything } from "@/lib/editions";
import { direction, LANGUAGES, script } from "@/lib/locales";

// Never in search results: the overview is for the owner only.
export const metadata: Metadata = { title: "Qissio editions", robots: { index: false } };

/**
 * Every edition at a glance, for the owner and for testing (only while developing, or with SHOW_EDITIONS=1).
 * Learners start at / (the landing page) or at the address of their own edition (/almanya, /spaans …).
 */
export default function Editions() {
  if (!showsEverything()) notFound();
  // Grouped by the language learned, then by name.
  const editions = Object.values(EDITIONS).sort((a, b) => a.target.localeCompare(b.target) || a.slug.localeCompare(b.slug));
  return (
    <main>
      <h1>Qissio</h1>
      <p className="muted">Editions</p>
      {editions.map((e) => (
        <Link
          key={e.slug}
          href={`/${e.slug}`}
          className="card edition-card"
          style={{ "--primary": e.color } as CSSProperties}
        >
          <div className="row">
            <span className="badge edition-badge">{`/${e.slug}`}</span>
            <span className="muted small">
              {LANGUAGES[e.base].name} → {LANGUAGES[e.target].name} · {e.status}
            </span>
          </div>
          <div lang={e.base} dir={direction(e.base)} data-script={script(e.base)}>
            <strong>{e.name}</strong>
            <p className="muted">{e.tagline}</p>
          </div>
        </Link>
      ))}
    </main>
  );
}
