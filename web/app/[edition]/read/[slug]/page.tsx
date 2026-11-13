import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  breadcrumbLd,
  Crumbs,
  isLockedCard,
  JsonLd,
  langName,
  levelName,
  libraryTrail,
  LevelLinks,
  StoryList,
  unlockHref,
} from "@/components/Library";
import { publicStories, publicStory, storyLanguages } from "@/lib/catalog";
import { direction } from "@/lib/locales";
import { fill, siteUrl } from "@/lib/site";
import { getEdition } from "../../dictionaries";

/**
 * One story as a public page (/almanya/read/bananen-hund). A free story shows all its scenes with the translation and
 * its key words: real text a search engine can rank, and a taste of the story before the app. A locked one shows
 * what it is about and the way to Plus. Either way one button leads into the app (docs/seo.md).
 */
export async function generateStaticParams({ params }: { params: { edition: string } }) {
  const slugs = (await publicStories(params.edition)).map((s) => ({ slug: s.slug }));
  // Cache Components wants at least one address per edition; an edition without stories gets a placeholder (404).
  return slugs.length ? slugs : [{ slug: "-" }];
}

async function storyOf(params: PageProps<"/[edition]/read/[slug]">["params"]) {
  const { edition, dict } = await getEdition();
  const story = await publicStory(edition.slug, (await params).slug);
  return { edition, dict, story };
}

export async function generateMetadata({ params }: PageProps<"/[edition]/read/[slug]">): Promise<Metadata> {
  const { edition, dict, story } = await storyOf(params);
  if (!story) return {};
  const title = fill(dict.seo.storyTitle, { title: story.title, lang: langName(dict, edition.target), level: story.level });
  const description = story.summary ?? undefined;
  return {
    title,
    description,
    alternates: {
      canonical: `/${edition.slug}/read/${story.slug}`,
      languages: await storyLanguages(edition.slug, story.slug),
    },
    openGraph: { title, description, type: "article", images: story.cover ? [story.cover] : undefined },
    twitter: { card: story.cover ? "summary_large_image" : "summary" },
  };
}

export default async function StoryPreview({ params }: PageProps<"/[edition]/read/[slug]">) {
  const { edition, dict, story } = await storyOf(params);
  if (!story) notFound();
  const locked = isLockedCard(edition, story);
  const level = `${story.level} · ${levelName(dict, story.level)}`;
  const trail = [
    ...libraryTrail(edition, dict),
    { name: level, href: `/${edition.slug}/level/${story.level.toLowerCase()}` },
    { name: story.title, href: `/${edition.slug}/read/${story.slug}` },
  ];
  const others = (await publicStories(edition.slug)).filter((s) => s.level === story.level && s.slug !== story.slug);
  const site = siteUrl();
  const target = edition.target;
  const baseDir = direction(edition.base);

  return (
    <main className="read">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["LearningResource", "ShortStory"],
          name: story.title,
          description: story.summary,
          inLanguage: target,
          educationalLevel: story.level,
          learningResourceType: "story",
          isAccessibleForFree: !locked,
          image: story.cover ? new URL(story.cover, site).href : undefined,
          url: `${site}/${edition.slug}/read/${story.slug}`,
          teaches: story.words.map((w) => w.text),
        }}
      />
      <JsonLd data={breadcrumbLd(site, trail)} />
      <Crumbs trail={trail.slice(0, 3)} />

      <h1 dir="ltr" lang={target}>{story.title}</h1>
      <p className="muted">
        {langName(dict, target)} · {level} · {locked ? dict.seo.plus : dict.seo.free}
      </p>
      {story.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
        <img className="read-cover" src={story.cover} alt={story.title} />
      )}
      {story.summary && <p className="read-summary">{story.summary}</p>}

      <PlayButton
        href={locked ? unlockHref(edition, story) : `/${edition.slug}/story/${story.id}`}
        label={locked ? dict.plus.cta : dict.seo.play}
        sub={locked ? dict.seo.locked : dict.seo.playSub}
      />

      {story.words.length > 0 && (
        <section>
          <h2 className="section-title">{dict.seo.words}</h2>
          <dl className="read-words">
            {story.words.map((w) => (
              <div key={w.text}>
                <dt dir="ltr" lang={target}>{w.text}</dt>
                <dd>{w.gloss}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {story.scenes.length > 0 && (
        <section>
          <h2 className="section-title">{dict.seo.story}</h2>
          {story.scenes.map((scene) => (
            <article key={scene.position} className="read-scene">
              {scene.image && scene.position > 1 && (
                // eslint-disable-next-line @next/next/no-img-element -- generated files come from Supabase Storage
                <img src={scene.image} alt="" loading="lazy" />
              )}
              <p dir="ltr" lang={target} className="read-text">{scene.text}</p>
              {scene.translation && (
                <p dir={baseDir} className="muted read-translation">{scene.translation}</p>
              )}
            </article>
          ))}
          <PlayButton href={`/${edition.slug}/story/${story.id}`} label={dict.seo.play} sub={dict.seo.playSub} />
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="section-title">{fill(dict.seo.moreAtLevel, { level: story.level })}</h2>
          <StoryList edition={edition} dict={dict} stories={others} />
        </section>
      )}
      <LevelLinks edition={edition} dict={dict} />
    </main>
  );
}

function PlayButton({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <div className="read-play">
      <Link className="cta" href={href}>
        {label} <span className="arrow">→</span>
      </Link>
      <span className="muted small">{sub}</span>
    </div>
  );
}
