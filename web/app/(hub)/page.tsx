import type { Metadata } from "next";
import { headers } from "next/headers";
import { Landing, type LandingEdition, type LandingTexts } from "@/components/Landing";
import ar from "@/dictionaries/ar.json";
import en from "@/dictionaries/en.json";
import nl from "@/dictionaries/nl.json";
import { publicEditions } from "@/lib/catalog";
import { direction, LANGUAGES, script } from "@/lib/locales";
import { formatPrice, plusOf } from "@/lib/products";
import { siteUrl } from "@/lib/site";
import { guessBase } from "@/lib/visitor";

/**
 * qissio.com itself: the landing page for everyone who did not come through an edition's address (returning visitors
 * go straight back to their edition, see proxy.ts). It opens in the language the browser suggests and starts with the
 * two choices that matter: the language you speak and the one you want to learn. Below, server-rendered so search
 * engines read it, why it works, the plans and the questions. Built from the editions, products and dictionaries
 * alone: a new edition or base language shows up here without a change.
 */

const DICTS: Record<string, typeof en> = { ar, en, nl };

// Rendered per visitor (the language comes from their browser), never prerendered.
export const instant = false;
const PRINCIPLES = ["input", "bizarre", "body", "picture", "speak", "timing"] as const;

async function visitorBase(): Promise<string> {
  const h = await headers();
  const base = guessBase(h.get("accept-language"), h.get("x-vercel-ip-country"));
  return DICTS[base] ? base : "en";
}

export async function generateMetadata(): Promise<Metadata> {
  const base = await visitorBase();
  const t = DICTS[base].landing;
  return {
    metadataBase: new URL(siteUrl()),
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: "/" },
    openGraph: { title: t.metaTitle, description: t.metaDescription, type: "website", siteName: "Qissio", url: "/" },
  };
}

/** Per edition what the landing page shows: its plans in its own base language, priced in that language's format. */
function landingEditions(): LandingEdition[] {
  return publicEditions()
    .filter((e) => DICTS[e.base])
    .sort((a, b) => a.base.localeCompare(b.base) || a.target.localeCompare(b.target))
    .map((e) => {
      const plus = plusOf(e);
      const month = plus?.prices.find((p) => p.interval === "month");
      const year = plus?.prices.find((p) => p.interval === "year");
      return {
        slug: e.slug,
        base: e.base,
        target: e.target,
        name: e.name,
        tagline: e.tagline,
        color: e.color,
        plus:
          plus && month && year
            ? {
                href: `/${e.slug}/p/${plus.slug}`,
                month: formatPrice(month, e.base),
                year: formatPrice(year, e.base),
                perks: plus.texts[e.base]?.perks ?? [],
              }
            : null,
        free: plus?.free
          ? { stories: plus.free.stories_per_level, phrases: plus.free.phrases_per_level, reviews: plus.free.reviews_per_day }
          : null,
      };
    });
}

function landingTexts(base: string): LandingTexts {
  const d = DICTS[base];
  return {
    baseName: LANGUAGES[base].name,
    dir: direction(base) === "rtl" ? "rtl" : "ltr",
    script: script(base),
    target: d.seo.lang,
    t: d.landing,
    pillars: d.welcome.pillars,
    why: d.welcome.why,
    method: d.welcome.method,
    principles: PRINCIPLES.map((k) => d.welcome.principles[k]),
  };
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const base = await visitorBase();
  const editions = landingEditions();
  const texts = Object.fromEntries([...new Set(editions.map((e) => e.base))].map((b) => [b, landingTexts(b)]));
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])),
  ).toString();
  const t = DICTS[base].landing;
  const site = siteUrl();
  // For search engines: who we are, the site, and the questions with their answers (FAQ rich results).
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Qissio", url: site, logo: `${site}/icon.svg` },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Qissio", url: site, inLanguage: base },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing editions={editions} texts={texts} initialBase={base} query={query} />
    </>
  );
}
