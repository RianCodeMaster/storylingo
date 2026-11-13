import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qissio",
    short_name: "Qissio",
    // One manifest for every base language, so in English; each page has its own description in its language.
    description: "Learn a language with crazy stories, gestures and questions.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#0F172A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
