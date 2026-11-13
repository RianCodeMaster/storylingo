import type { MetadataRoute } from "next";
import { publicEditions, publicStories, storyLanguages } from "@/lib/catalog";
import { siteUrl } from "@/lib/site";

/**
 * Every public page for search engines (/sitemap.xml): per edition its home, its tracks, the library, each level and
 * each story, with the same story in the other base languages as alternates. The app's own screens (a story being
 * played, review, account) are not in it: those are for learners, not for search results.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const pages: MetadataRoute.Sitemap = [];
  for (const edition of publicEditions()) {
    const at = (path: string) => `${site}/${edition.slug}${path}`;
    pages.push({ url: at(""), changeFrequency: "weekly", priority: 1 });
    for (const track of edition.tracks) pages.push({ url: at(`/${track.slug}`), changeFrequency: "monthly", priority: 0.9 });
    pages.push({ url: at("/read"), changeFrequency: "weekly", priority: 0.8 });
    for (const level of edition.stories.levels) {
      pages.push({ url: at(`/level/${level.toLowerCase()}`), changeFrequency: "weekly", priority: 0.7 });
    }
    for (const story of await publicStories(edition.slug)) {
      const languages = Object.fromEntries(
        Object.entries(await storyLanguages(edition.slug, story.slug)).map(([lang, path]) => [lang, `${site}${path}`]),
      );
      pages.push({ url: at(`/read/${story.slug}`), changeFrequency: "monthly", priority: 0.6, alternates: { languages } });
    }
  }
  return pages;
}
