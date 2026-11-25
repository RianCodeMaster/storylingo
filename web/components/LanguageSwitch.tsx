"use client";

import Link from "next/link";
import { useState } from "react";
import { siblingsOf } from "@/lib/editions";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/locales";

/**
 * The language of the app, top right: 🌐 and the current language in its own script. It opens the other base
 * languages that teach the same language (the same edition family: almanya, duits, german), each in its own script
 * with its code as a small badge, so anyone finds theirs whatever the page is in. Only editions that exist are
 * offered. Choosing one opens that edition (which the browser then remembers: proxy.ts, qissio_edition). Last in the
 * menu: learning another language altogether, on the landing page at /.
 *
 * keepQuery: the welcome carries the address's campaign and video goal along, so the visit still counts for its
 * video. warn: on the start screen, a learner's progress belongs to the edition, so they are told first.
 */
export function LanguageSwitch({
  keepQuery = false,
  warn = false,
  compact = false,
}: {
  keepQuery?: boolean;
  warn?: boolean;
  compact?: boolean; // a full header (the start screen): 🌐 and the language's code only
}) {
  const { dict, edition } = useI18n();
  const [open, setOpen] = useState(false);
  const family = siblingsOf(edition);

  function go(slug: string) {
    if (slug === edition.slug) return setOpen(false);
    if (warn && !window.confirm(dict.language.keepsProgress)) return;
    // A full load on purpose: another edition has its own layout, language and direction.
    window.location.assign(new URL(`/${slug}${keepQuery ? window.location.search : ""}`, window.location.origin));
  }

  return (
    <div className="lang-switch">
      <button
        className="lang-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={dict.language.title}
        onClick={() => setOpen((o) => !o)}
      >
        🌐{" "}
        <span lang={edition.base}>{compact ? edition.base.toUpperCase() : (LANGUAGES[edition.base]?.name ?? edition.base)}</span>
        {!compact && <span aria-hidden> ▾</span>}
      </button>
      {open && (
        <>
          {/* Tapping anywhere else closes the menu. */}
          <button className="lang-backdrop" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="lang-menu" role="menu">
            <p className="lang-menu-title">🌐 {dict.language.title}</p>
            {family.map((e) => (
              <button
                key={e.slug}
                role="menuitemradio"
                aria-checked={e.slug === edition.slug}
                className={e.slug === edition.slug ? "lang-item current" : "lang-item"}
                onClick={() => go(e.slug)}
              >
                <span className="lang-badge">{e.base.toUpperCase()}</span>
                <span lang={e.base} dir={LANGUAGES[e.base]?.direction ?? "auto"} className="lang-name">
                  {LANGUAGES[e.base]?.name ?? e.base}
                </span>
                {e.slug === edition.slug && <span className="lang-check">✓</span>}
              </button>
            ))}
            {/* Another language to learn: the landing page's two choices (?choose skips the way back to here). */}
            <Link className="lang-item lang-other" href="/?choose=1">
              <span className="lang-badge">🌍</span>
              <span className="lang-name">{dict.landing.other}</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
