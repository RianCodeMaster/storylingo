import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from "./lib/locales";

const known = (code: string | undefined): code is string => !!code && (LOCALES as readonly string[]).includes(code);

/** The learner's own choice from the language menu, otherwise the best match from the browser's Accept-Language. */
function pickLocale(request: NextRequest): string {
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  if (known(chosen)) return chosen;
  const wanted = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase());
  return wanted.find(known) ?? DEFAULT_LOCALE;
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
