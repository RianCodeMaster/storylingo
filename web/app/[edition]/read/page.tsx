import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbLd, Crumbs, JsonLd, langName, libraryTitle, libraryTrail, LevelLinks, StoryList } from "@/components/Library";
import { publicStories } from "@/lib/catalog";
import { fill, siteUrl } from "@/lib/site";
import { getEdition } from "../dictionaries";

/**
 * Every story of an edition, by level: the public library (/almanya/read). Server-rendered and cached, so it is the
 * page search engines find for "stories in German"; each story and level has its own page below it (docs/seo.md).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { edition, dict } = await getEdition();
  const title = libraryTitle(edition, dict);
  const description = fill(dict.seo.libraryDescription, { lang: langName(dict, edition.target) });
  return {
    title,
    description,
    alternates: { canonical: `/${edition.slug}/read` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function Library() {
  const { edition, dict } = await getEdition();
  const stories = await publicStories(edition.slug);
  const trail = libraryTrail(edition, dict);
  return (
    <main className="read">
      <JsonLd data={breadcrumbLd(siteUrl(), trail)} />
      <Crumbs trail={trail.slice(0, 1)} />
      <h1>{libraryTitle(edition, dict)}</h1>
      <p>{dict.seo.libraryIntro}</p>
      <Link className="cta" href={`/${edition.slug}`}>
        {dict.seo.start} <span className="arrow">→</span>
      </Link>
      {edition.stories.levels.map((level) => {
        const atLevel = stories.filter((s) => s.level === level);
        if (!atLevel.length) return null;
        return (
          <section key={level}>
            <h2 className="section-title">
              <Link href={`/${edition.slug}/level/${level.toLowerCase()}`}>
                {level} · {dict.level.names[level as keyof typeof dict.level.names]}
              </Link>
            </h2>
            <StoryList edition={edition} dict={dict} stories={atLevel} />
          </section>
        );
      })}
      <LevelLinks edition={edition} dict={dict} />
    </main>
  );
}
