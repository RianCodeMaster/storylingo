import type { Metadata } from "next";
import Phrases from "@/components/Phrases";

// A screen of the app for one learner, not a page for search results (the public pages are /read, docs/seo.md).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function PhrasesPage() {
  return <Phrases />;
}
