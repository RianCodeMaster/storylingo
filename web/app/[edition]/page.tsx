import type { Metadata } from "next";
import { Home } from "@/components/Home";
import { LevelLinks } from "@/components/Library";
import { publicEditions } from "@/lib/catalog";
import { fill, siteUrl } from "@/lib/site";
import { getEdition } from "./dictionaries";

/**
 * An edition's home (components/Home.tsx); a track's address shows the same page with its own welcome. Below the app,
 * server-rendered links to the public story pages, so search engines find them from the first page they visit.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { edition, dict } = await getEdition();
  // The same app for the same language, with texts in another language: one per base language (hreflang), and the
  // landing page at / for everyone else.
  const languages: Record<string, string> = { "x-default": "/" };
  for (const e of [edition, ...publicEditions()]) {
    if (e.target === edition.target && !languages[e.base]) languages[e.base] = `/${e.slug}`;
  }
  // In search results what people type ("تعلّم اللغة الألمانية", "Duits leren"), not the edition's own name.
  const lang = dict.seo.lang[edition.target as keyof typeof dict.seo.lang];
  const title = fill(dict.seo.homeTitle, { lang });
  const description = fill(dict.seo.homeDescription, { lang });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/${edition.slug}`, languages },
    openGraph: { title, description, type: "website" },
  };
}

export default async function EditionHome() {
  const { edition, dict } = await getEdition();
  const site = siteUrl();
  const lang = dict.seo.lang[edition.target as keyof typeof dict.seo.lang];
  // For search engines: this edition is a free online course in the language learned, taught in the base language.
  const course = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: fill(dict.seo.homeTitle, { lang }).replace(/ [|–].*$/, ""),
    description: fill(dict.seo.homeDescription, { lang }),
    url: `${site}/${edition.slug}`,
    inLanguage: edition.base,
    educationalLevel: edition.stories.levels.join(", "),
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "Qissio", url: site },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: "PT5M" },
    offers: { "@type": "Offer", price: 0, priceCurrency: "EUR", category: "Free" },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(course) }} />
      <Home />
      <footer className="read-footer">
        <LevelLinks edition={edition} dict={dict} />
      </footer>
    </>
  );
}
