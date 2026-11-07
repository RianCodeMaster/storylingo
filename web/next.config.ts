import type { NextConfig } from "next";

// Locally the app reaches Supabase (port 54321) through /sb on its own origin, so the same URL also works from a
// phone on the home network. Online NEXT_PUBLIC_SUPABASE_URL is set and the app talks to Supabase directly
// (lib/supabase.ts); the rewrite then stays unused.
const SUPABASE_LOCAL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Phones on the home network open the dev server by IP address.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  rewrites() {
    return [{ source: "/sb/:path*", destination: `${SUPABASE_LOCAL}/:path*` }];
  },
};

export default nextConfig;
