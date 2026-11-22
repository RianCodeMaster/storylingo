import { type NextRequest, NextResponse } from "next/server";
import { isEdition, showsEverything } from "@/lib/editions";
// Per video code, what the video showed (docs/campagnes.md): a story video → that story, a phrase video → phrases.
import VIDEO_GOALS from "@/lib/video-codes.json";

// The edition for each base language, teaching German (the largest niche): where qissio.com itself leads, and where
// old links from before editions (/nl/…, /ar/…) land.
const EDITION_FOR: Record<string, string> = { nl: "duits", en: "german", ar: "almanya" };
const FALLBACK = "german";

/** The visitor's languages from the browser, most wanted first ("ar-SA,ar;q=0.9,en;q=0.8" → ar, ar, en). */
function languages(header: string | null): string[] {
  return (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((l) => l.lang && !Number.isNaN(l.q))
    .sort((a, b) => b.q - a.q)
    .map((l) => l.lang);
}

/** The edition in the visitor's own language (an Arabic phone: almanya, a Dutch one: duits, else german). */
function editionByLanguage(request: NextRequest): string {
  const lang = languages(request.headers.get("accept-language")).find((l) => EDITION_FOR[l]);
  return lang ? EDITION_FOR[lang] : FALLBACK;
}

/**
 * - qissio.com itself: on to the edition in the visitor's own language (an Arabic phone to /almanya, a Dutch one to
 *   /duits, everyone else to /german), keeping campaign parameters. While developing / is the overview of editions.
 * - /nl/story/123 (old links) becomes /duits/story/123.
 * - /v/<code>: a short address shown in a video, see videoCode().
 */
export function proxy(request: NextRequest) {
  const [, first, ...rest] = request.nextUrl.pathname.split("/");
  if (first === "v") return videoCode(request, rest[0]);
  if (!first) {
    if (showsEverything()) return;
    request.nextUrl.pathname = `/${editionByLanguage(request)}`;
    const response = NextResponse.redirect(request.nextUrl, 307);
    // The answer depends on the language, so caches must not hand an Arabic visitor the Dutch redirect.
    response.headers.set("Vary", "Accept-Language");
    return response;
  }
  const edition = EDITION_FOR[first];
  if (!edition) return;
  request.nextUrl.pathname = ["", edition, ...rest].join("/");
  return NextResponse.redirect(request.nextUrl);
}

// Short video codes (docs/campagnes.md): links in TikTok captions and Shorts descriptions cannot be clicked, so a
// video shows a short address that viewers type over, and that address carries the video as its campaign.
const VIDEO_CODE = /^[a-z0-9-]{1,30}$/;

/** One line of lib/video-codes.json: which edition (and track) the video is for, and what it showed. */
interface VideoGoal {
  edition: string; // the edition the video was made for (almanya, duits, spaans, …)
  track?: string; // a way into that edition, such as "b1-examen"
  story?: string; // a story video: that story's slug
  start?: string; // "phrases": a phrase video
  topic?: string; // with start phrases: the topic it was about (health, work, …)
}

/**
 * /v/c05 → /almanya?utm_source=video&utm_campaign=c05: lib/video-codes.json says per code which edition and track
 * the video was made for and what comes first on the welcome. The same for every edition: nothing here belongs to
 * one language pair. A code without a line (or a malformed one) goes, like qissio.com itself, to the edition in the
 * visitor's own language; a code that at least looks like one is still counted as its campaign.
 */
function videoCode(request: NextRequest, code: string | undefined) {
  const url = request.nextUrl.clone();
  url.search = "";
  const clean = (code ?? "").trim().toLowerCase();
  const valid = VIDEO_CODE.test(clean);
  const goal: Partial<VideoGoal> = (valid && (VIDEO_GOALS as Record<string, VideoGoal>)[clean]) || {};
  const edition = goal.edition && isEdition(goal.edition) ? goal.edition : editionByLanguage(request);
  url.pathname = goal.track && goal.edition === edition ? `/${edition}/${goal.track}` : `/${edition}`;
  if (valid) {
    url.searchParams.set("utm_source", "video");
    url.searchParams.set("utm_campaign", clean);
    // What the video showed comes first on the welcome (Home): its own story, or the phrases (of its topic).
    if (goal.story) url.searchParams.set("story", goal.story);
    if (goal.start) url.searchParams.set("start", goal.start);
    if (goal.topic) url.searchParams.set("topic", goal.topic);
  }
  // Temporary, so a code can later point somewhere else without browsers holding on to the old answer.
  const response = NextResponse.redirect(url, 307);
  // Without a line the answer depends on the visitor's language, so caches must not share it between languages.
  if (!goal.edition) response.headers.set("Vary", "Accept-Language");
  return response;
}

export const config = {
  // Not for Next.js internals, the Supabase proxy (/sb) or files such as /icon.svg and the manifest.
  matcher: ["/((?!_next|sb|.*\\..*|manifest.webmanifest).*)"],
};
