/**
 * Where the site lives, for absolute links in search results, the sitemap and shared previews. A custom domain is
 * set as NEXT_PUBLIC_SITE_URL; without it Vercel's own production address is used, and locally localhost.
 */
export function siteUrl(): string {
  const set = process.env.NEXT_PUBLIC_SITE_URL;
  if (set) return set.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Fill {placeholders} in a dictionary text (the server-side twin of fill in lib/i18n.tsx). */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
