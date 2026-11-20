import { type NextRequest, NextResponse } from "next/server";
import { showsEverything } from "@/lib/editions";

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
    const lang = languages(request.headers.get("accept-language")).find((l) => EDITION_FOR[l]);
    request.nextUrl.pathname = `/${lang ? EDITION_FOR[lang] : FALLBACK}`;
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
const VIDEO_EDITION = "almanya";
const VIDEO_CODE = /^[a-z0-9-]{1,30}$/;

// A code that starts with one of these opens that track of the edition (b1-c05 → /almanya/b1-examen).
const VIDEO_TRACK: Record<string, string> = { "b1-": "b1-examen" };

/**
 * /v/c05 → /almanya?utm_source=video&utm_campaign=c05, /v/b1-c05 → /almanya/b1-examen?…utm_campaign=b1-c05.
 * An unknown or malformed code still lands on the edition, without a campaign.
 */
function videoCode(request: NextRequest, code: string | undefined) {
  const url = request.nextUrl.clone();
  url.search = "";
  const clean = (code ?? "").trim().toLowerCase();
  const track = Object.entries(VIDEO_TRACK).find(([prefix]) => clean.startsWith(prefix))?.[1];
  url.pathname = track ? `/${VIDEO_EDITION}/${track}` : `/${VIDEO_EDITION}`;
  if (VIDEO_CODE.test(clean)) {
    url.searchParams.set("utm_source", "video");
    url.searchParams.set("utm_campaign", clean);
  }
  // Temporary, so a code can later point somewhere else without browsers holding on to the old answer.
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Not for Next.js internals, the Supabase proxy (/sb) or files such as /icon.svg and the manifest.
  matcher: ["/((?!_next|sb|.*\\..*|manifest.webmanifest).*)"],
};
