import { type NextRequest, NextResponse } from "next/server";

// Base languages with a dictionary (keep in sync with app/[lang]/dictionaries.ts).
const LOCALES = ["nl"];
const DEFAULT_LOCALE = "nl";

/** The best base language for this browser, from its Accept-Language list. */
function pickLocale(request: NextRequest): string {
  const wanted = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase());
  return wanted.find((code) => LOCALES.includes(code)) ?? DEFAULT_LOCALE;
}

/** Every page lives under a base language: /story/123 becomes /nl/story/123. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))) return;
  request.nextUrl.pathname = `/${pickLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Not for Next.js internals, the Supabase proxy (/sb) or files such as /icon.svg and the manifest.
  matcher: ["/((?!_next|sb|.*\\..*|manifest.webmanifest).*)"],
};
