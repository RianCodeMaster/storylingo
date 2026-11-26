"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * qissio.com itself (app/(hub)/page.tsx): first the two choices that decide everything (the language you speak, the
 * language you want to learn) with one big button, then why it works, the plans and the questions. The page opens in
 * the language the visitor's browser suggests; choosing another "I speak" switches the page to that language at once.
 * Everything comes in as data (editions, texts per base language), so a new edition or base language needs no change.
 */

export interface LandingEdition {
  slug: string;
  base: string;
  target: string;
  name: string;
  tagline: string;
  color: string;
  plus: { href: string; month: string; year: string; save: number; text: string; perks: string[] } | null;
  free: { stories: number; phrases: number; words: number } | null;
}

export interface LandingTexts {
  baseName: string; // the base language in itself ("العربية")
  dir: "ltr" | "rtl";
  script: string;
  target: Record<string, string>; // the languages learned, in this base language ("الألمانية")
  t: {
    h1: string;
    sub: string;
    speak: string;
    learn: string;
    start: string;
    free: string;
    plans: string;
    howTitle: string;
    steps: string[];
    plansTitle: string;
    freeTitle: string;
    freePerks: string[];
    plusLine: string;
    plusBadge: string;
    perMonth: string;
    perYear: string;
    save: string;
    plusCta: string;
    faqTitle: string;
    faq: { q: string; a: string }[];
    editionsTitle: string;
  };
  pillars: { words: string; speak: string; review: string };
  why: string;
  method: string;
  principles: { title: string; line: string; term: string }[];
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));

export function Landing(props: {
  editions: LandingEdition[];
  texts: Record<string, LandingTexts>;
  initialBase: string;
  query: string; // campaign parameters to carry on (utm_…), without the leading "?"
}) {
  const router = useRouter();
  const bases = useMemo(() => [...new Set(props.editions.map((e) => e.base))], [props.editions]);
  const [base, setBase] = useState(bases.includes(props.initialBase) ? props.initialBase : bases[0]);
  const targets = props.editions.filter((e) => e.base === base).map((e) => e.target);
  const [target, setTarget] = useState(targets[0]);
  const edition = props.editions.find((e) => e.base === base && e.target === target) ?? props.editions.find((e) => e.base === base)!;
  const L = props.texts[base];

  // Another "I speak": the page follows (language, direction, script), and the language learned stays if it exists.
  useEffect(() => {
    const html = document.documentElement;
    html.lang = base;
    html.dir = L.dir;
    html.dataset.script = L.script;
    html.style.setProperty("--primary", edition.color);
  }, [base, L, edition.color]);

  const chooseBase = (next: string) => {
    setBase(next);
    const has = props.editions.some((e) => e.base === next && e.target === target);
    if (!has) setTarget(props.editions.find((e) => e.base === next)!.target);
  };

  // The edition's own welcome, past its language question (answered here); campaign parameters go along.
  const start = () => {
    const params = new URLSearchParams(props.query);
    params.delete("choose");
    params.set("step", "level");
    router.push(`/${edition.slug}?${params}`);
  };
  const toTop = () => document.getElementById("choose")?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className="landing">
      <p className="edition-name brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="brand-icon" />
        Qissio
      </p>

      <section id="choose" className="landing-hero card">
        <h1>{L.t.h1}</h1>
        <p className="muted">{L.t.sub}</p>
        <div className="pair">
          <label>
            <span className="small muted">{L.t.speak}</span>
            <select value={base} onChange={(e) => chooseBase(e.target.value)}>
              {bases.map((b) => (
                <option key={b} value={b}>
                  {props.texts[b].baseName}
                </option>
              ))}
            </select>
          </label>
          <span className="pair-arrow" aria-hidden>
            {L.dir === "rtl" ? "←" : "→"}
          </span>
          <label>
            <span className="small muted">{L.t.learn}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {L.target[t] ?? t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="cta cta-big" onClick={start}>
          {L.t.start}
        </button>
        <p className="small muted center">{L.t.free}</p>
        <p className="center small">
          <em>{edition.tagline}</em>
        </p>
      </section>

      <ul className="landing-pillars">
        <li>🖼️ {L.pillars.words}</li>
        <li>🗣️ {L.pillars.speak}</li>
        <li>🔁 {L.pillars.review}</li>
      </ul>

      <section className="landing-section">
        <h2>{L.t.howTitle}</h2>
        <ol className="steps">
          {L.t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2>{L.why}</h2>
        <p className="muted">{L.method}</p>
        <dl className="principles">
          {L.principles.map((p) => (
            <div key={p.title}>
              <dt>{p.title}</dt>
              <dd>
                {p.line} <span className="term">{p.term}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="plans" className="landing-section">
        <h2>{L.t.plansTitle}</h2>
        <div className="plans">
          <div className="card plan">
            <h3>{L.t.freeTitle}</h3>
            <p className="plan-price">0 €</p>
            {edition.free && (
              <ul>
                {L.t.freePerks.map((p) => (
                  <li key={p}>{fill(p, edition.free!)}</li>
                ))}
              </ul>
            )}
          </div>
          {edition.plus && (
            <div className="card plan plan-plus">
              <p className="plan-badge">✨ {L.t.plusBadge}</p>
              <h3>⭐ Plus</h3>
              <p className="plan-price">
                {edition.plus.month} <span className="small muted">{L.t.perMonth}</span>
              </p>
              <p className="small muted">
                {fill(L.t.perYear, { price: edition.plus.year })}
                {edition.plus.save > 0 && <span className="plan-save"> {fill(L.t.save, { pct: edition.plus.save })}</span>}
              </p>
              <p className="plan-line">{edition.plus.text || L.t.plusLine}</p>
              <ul className="plan-perks">
                {edition.plus.perks.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <a className="cta plan-cta" href={edition.plus.href}>
                {L.t.plusCta} {L.dir === "rtl" ? "←" : "→"}
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="landing-section">
        <h2>{L.t.faqTitle}</h2>
        {L.t.faq.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <button type="button" className="cta cta-big" onClick={toTop}>
        {L.t.start}
      </button>

      <footer className="landing-editions">
        <h2 className="small muted">{L.t.editionsTitle}</h2>
        {props.editions.map((e) => (
          <a key={e.slug} href={`/${e.slug}`} lang={e.base} dir={props.texts[e.base].dir}>
            <strong>{e.name}</strong> <span className="muted small">{e.tagline}</span>
          </a>
        ))}
      </footer>
    </main>
  );
}
