import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { breadcrumbLd, Crumbs, JsonLd, langName, levelName, libraryTrail, LevelLinks, StoryList } from "@/components/Library";
import { publicStories } from "@/lib/catalog";
import { EDITIONS } from "@/lib/editions";
import { fill, siteUrl } from "@/lib/site";
import { getEdition } from "../../dictionaries";

/**
 * One level of an edition (/almanya/level/a1): what that level means, and its stories. Lowercase in the address,
 * as people type it; levels the edition does not offer are a 404.
 */
export function generateStaticParams({ params }: { params: { edition: string } }) {
  return (EDITIONS[params.edition]?.stories.levels ?? []).map((l) => ({ level: l.toLowerCase() }));
}

async function levelOf(params: PageProps<"/[edition]/level/[level]">["params"]) {
  const { edition, dict } = await getEdition();
  const level = (await params).level.toUpperCase();
  return { edition, dict, level: edition.stories.levels.includes(level) ? level : null };
}

export async function generateMetadata({ params }: PageProps<"/[edition]/level/[level]">): Promise<Metadata> {
  const { edition, dict, level } = await levelOf(params);
  if (!level) return {};
  const lang = langName(dict, edition.target);
  const count = (await publicStories(edition.slug)).filter((s) => s.level === level).length;
  const title = fill(dict.seo.levelTitle, { lang, level, levelName: levelName(dict, level) });
  const description = fill(dict.seo.levelDescription, { lang, level, count });
  return {
    title,
    description,
    alternates: { canonical: `/${edition.slug}/level/${level.toLowerCase()}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function LevelPage({ params }: PageProps<"/[edition]/level/[level]">) {
  const { edition, dict, level } = await levelOf(params);
  if (!level) notFound();
  const stories = (await publicStories(edition.slug)).filter((s) => s.level === level);
  const lang = langName(dict, edition.target);
  const trail = [
    ...libraryTrail(edition, dict),
    { name: `${level} · ${levelName(dict, level)}`, href: `/${edition.slug}/level/${level.toLowerCase()}` },
  ];
  return (
    <main className="read">
      <JsonLd data={breadcrumbLd(siteUrl(), trail)} />
      <Crumbs trail={trail.slice(0, 2)} />
      <h1>{fill(dict.seo.levelTitle, { lang, level, levelName: levelName(dict, level) })}</h1>
      {dict.seo.levelAbout[level as keyof typeof dict.seo.levelAbout] && (
        <p>{dict.seo.levelAbout[level as keyof typeof dict.seo.levelAbout]}</p>
      )}
      <Link className="cta" href={`/${edition.slug}`}>
        {dict.seo.start} <span className="arrow">→</span>
      </Link>
      <StoryList edition={edition} dict={dict} stories={stories} />
      <LevelLinks edition={edition} dict={dict} />
    </main>
  );
}
