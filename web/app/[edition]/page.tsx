import type { Metadata } from "next";
import { Home } from "@/components/Home";
import { LevelLinks } from "@/components/Library";
import { publicEditions } from "@/lib/catalog";
import { getEdition } from "./dictionaries";

/**
 * An edition's home (components/Home.tsx); a track's address shows the same page with its own welcome. Below the app,
 * server-rendered links to the public story pages, so search engines find them from the first page they visit.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { edition } = await getEdition();
  // The same app for the same language, with texts in another language: one per base language (hreflang).
  const languages: Record<string, string> = {};
  for (const e of [edition, ...publicEditions()]) {
    if (e.target === edition.target && !languages[e.base]) languages[e.base] = `/${e.slug}`;
  }
  return {
    alternates: { canonical: `/${edition.slug}`, languages },
    openGraph: { title: edition.name, description: edition.tagline, type: "website" },
  };
}

export default async function EditionHome() {
  const { edition, dict } = await getEdition();
  return (
    <>
      <Home />
      <footer className="read-footer">
        <LevelLinks edition={edition} dict={dict} />
      </footer>
    </>
  );
}
