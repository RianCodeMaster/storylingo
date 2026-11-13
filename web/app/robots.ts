import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * What search engines may crawl (/robots.txt): everything except the local Supabase passthrough. The app's own
 * screens per learner (a story being played, review, account) are crawlable but say noindex themselves; blocking them
 * here would hide that noindex, and a blocked address can still show up in results without its text.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/sb/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
