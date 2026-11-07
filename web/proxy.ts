import { type NextRequest, NextResponse } from "next/server";

// Before editions, pages lived under a base language. Old links (bookmarks, the phone's home screen) land on the
// edition that speaks that language and teaches German.
const OLD_LANGUAGE_PATHS: Record<string, string> = { nl: "duits", en: "german", ar: "almanya" };

/** /nl/story/123 becomes /duits/story/123. Every other path is an edition or the overview at /. */
export function proxy(request: NextRequest) {
  const [, first, ...rest] = request.nextUrl.pathname.split("/");
  const edition = OLD_LANGUAGE_PATHS[first];
  if (!edition) return;
  request.nextUrl.pathname = ["", edition, ...rest].join("/");
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Not for Next.js internals, the Supabase proxy (/sb) or files such as /icon.svg and the manifest.
  matcher: ["/((?!_next|sb|.*\\..*|manifest.webmanifest).*)"],
};
