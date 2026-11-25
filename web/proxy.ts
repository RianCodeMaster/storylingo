import { type NextRequest, NextResponse } from "next/server";
import { EDITIONS, isEdition, showsEverything } from "@/lib/editions";
// Per video code, what the video showed (docs/campagnes.md): a story video → that story, a phrase video → phrases.
import VIDEO_GOALS from "@/lib/video-codes.json";

import { EDITION_COOKIE, EDITION_FOR, guessBase } from "@/lib/visitor";

/** An edition a visitor may be sent to: one that exists and is not a draft (drafts only while developing). */
const open = (slug: string | undefined): slug is string =>
  isEdition(slug) && (EDITIONS[slug].status !== "draft" || showsEverything());

/**
 * Where someone goes who did not say which edition (qissio.com itself, a video code without a line):
 * 1. the edition they used last in this browser (the cookie);
 * 2. their browser's language, but English only weakly: in a country with its own base language (the Netherlands,
 *    Morocco …) that country's language wins, since many there have English Windows or phones;
 * 3. else the English edition.
 */
function guessEdition(request: NextRequest): string {
  const last = request.cookies.get(EDITION_COOKIE)?.value;
  if (open(last)) return last;
  return EDITION_FOR[guessBase(request.headers.get("accept-language"), request.headers.get("x-vercel-ip-country"))];
}

/** A guess depends on the language, the country and the cookie: caches must never share it between visitors. */
function guessed(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * - qissio.com itself: someone who used an edition before goes straight back to it (keeping campaign parameters);
 *   everyone else gets the landing page (app/(hub)/page.tsx), where they choose the language they speak and the one
 *   they want to learn. Its language depends on the browser, so no cache may share it between visitors.
 * - /nl/story/123 (old links) becomes /duits/story/123.
 * - /v/<code>: a short address shown in a video, see videoCode().
 * - any page of an edition: that edition is remembered as the visitor's last (EDITION_COOKIE).
 */
export function proxy(request: NextRequest) {
  const [, first, ...rest] = request.nextUrl.pathname.split("/");
  if (first === "v") return videoCode(request, rest[0]);
  if (!first) {
    const last = request.cookies.get(EDITION_COOKIE)?.value;
    if (open(last) && !request.nextUrl.searchParams.has("choose")) {
      request.nextUrl.pathname = `/${last}`;
      return guessed(request.nextUrl);
    }
    const response = NextResponse.next();
    response.headers.set("Vary", "Accept-Language, Cookie");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (open(first)) {
    if (request.cookies.get(EDITION_COOKIE)?.value === first) return;
    const response = NextResponse.next();
    response.cookies.set(EDITION_COOKIE, first, {
      path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    });
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
// The same video on another platform: "a01-fb" is video a01 (its line in video-codes.json) but its own campaign,
// so the funnel shows per video per platform where visitors came from.
const PLATFORM_SUFFIX = /-(tt|yt|fb|ig)$/;

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
  const goals = VIDEO_GOALS as Record<string, VideoGoal>;
  const goal: Partial<VideoGoal> = (valid && (goals[clean] ?? goals[clean.replace(PLATFORM_SUFFIX, "")])) || {};
  const edition = open(goal.edition) ? goal.edition : guessEdition(request);
  url.pathname = goal.track && goal.edition === edition ? `/${edition}/${goal.track}` : `/${edition}`;
  if (valid) {
    url.searchParams.set("utm_source", "video");
    url.searchParams.set("utm_campaign", clean);
    // What the video showed comes first on the welcome (Home): its own story, or the phrases (of its topic).
    if (goal.story) url.searchParams.set("story", goal.story);
    if (goal.start) url.searchParams.set("start", goal.start);
    if (goal.topic) url.searchParams.set("topic", goal.topic);
  }
  // Without a line the edition was guessed (per visitor); with one it is fixed. Temporary either way, so a code can
  // later point somewhere else without browsers holding on to the old answer.
  return goal.edition ? NextResponse.redirect(url, 307) : guessed(url);
}

export const config = {
  // Not for Next.js internals, the Supabase proxy (/sb) or files such as /icon.svg and the manifest.
  matcher: ["/((?!_next|sb|.*\\..*|manifest.webmanifest).*)"],
};
