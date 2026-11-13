import Link from "next/link";
import { legalTitle } from "@/components/Legal";
import type { PublicCard } from "@/lib/catalog";
import type { Edition } from "@/lib/editions";
import type { Dictionary } from "@/lib/i18n";
import { plusOf } from "@/lib/products";
import { fill } from "@/lib/site";

/**
 * The building blocks of the public pages (app/[edition]/read, app/[edition]/level): server-rendered, so a search
 * engine reads the whole page without running the app. Every link stays inside the public pages or leads into the
 * app with one clear button.
 */

/** Whether a visitor without Plus or the story's pack can read it; the same rule as the database. */
export const isLockedCard = (edition: Edition, s: PublicCard) => s.product !== null || (!s.free && !!plusOf(edition));

/** Where a locked story leads in the app: its pack, or Plus. */
export const unlockHref = (edition: Edition, s: PublicCard) =>
  `/${edition.slug}/p/${s.product ?? plusOf(edition)?.slug ?? ""}`;

export function StoryList({ edition, dict, stories }: { edition: Edition; dict: Dictionary; stories: PublicCard[] }) {
  return (
    <div className="read-list">
      {stories.map((s) => {
        const locked = isLockedCard(edition, s);
        return (
          <Link key={s.slug} href={`/${edition.slug}/read/${s.slug}`} className="story-row">
            {s.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
              <img src={s.cover} alt={s.title} loading="lazy" />
            ) : (
              <span className="story-row-blank">📖</span>
            )}
            <div>
              <strong dir="ltr" lang={edition.target}>{s.title}</strong>
              {s.summary && <span className="muted small">{s.summary}</span>}
              <span className={`read-tag${locked ? " read-tag-plus" : ""}`}>
                {s.level} · {locked ? dict.seo.plus : dict.seo.free}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** The way back up: edition, all stories, a level. The same trail goes into the page's structured data. */
export function Crumbs({ trail }: { trail: { name: string; href: string }[] }) {
  return (
    <nav className="crumbs" aria-label="breadcrumb">
      {trail.map((c, i) => (
        <span key={c.href}>
          {i > 0 && <span className="crumbs-sep">›</span>}
          <Link href={c.href}>{c.name}</Link>
        </span>
      ))}
    </nav>
  );
}

/** The levels of an edition as links, at the bottom of every public page, so every level is one click away. */
export function LevelLinks({ edition, dict }: { edition: Edition; dict: Dictionary }) {
  return (
    <nav className="read-levels" aria-label={dict.seo.levels}>
      <strong>{dict.seo.levels}</strong>
      <div>
        {edition.stories.levels.map((level) => (
          <Link key={level} href={`/${edition.slug}/level/${level.toLowerCase()}`} className="read-level">
            {level} · {dict.level.names[level as keyof typeof dict.level.names]}
          </Link>
        ))}
      </div>
      <Link href={`/${edition.slug}/read`}>{dict.seo.allStories} →</Link>
      <span className="muted small">
        <Link href={`/${edition.slug}/terms`}>{legalTitle(edition.base, "terms")}</Link>
        {" · "}
        <Link href={`/${edition.slug}/privacy`}>{legalTitle(edition.base, "privacy")}</Link>
      </span>
    </nav>
  );
}

/** Structured data for search engines (schema.org), in the page as JSON-LD. */
export function JsonLd({ data }: { data: object }) {
  // "<" escaped, so no text in the data can close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const breadcrumbLd = (base: string, trail: { name: string; href: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${base}${c.href}` })),
});

/** The edition's own name and the trail's first steps, shared by every public page. */
export const libraryTrail = (edition: Edition, dict: Dictionary) => [
  { name: edition.name, href: `/${edition.slug}` },
  { name: dict.seo.allStories, href: `/${edition.slug}/read` },
];

export const levelName = (dict: Dictionary, level: string) =>
  dict.level.names[level as keyof typeof dict.level.names] ?? level;

export const langName = (dict: Dictionary, code: string) => dict.seo.lang[code as keyof typeof dict.seo.lang] ?? code;

export const libraryTitle = (edition: Edition, dict: Dictionary) =>
  fill(dict.seo.libraryTitle, { lang: langName(dict, edition.target) });
