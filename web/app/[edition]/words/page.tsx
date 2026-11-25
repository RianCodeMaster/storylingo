import type { Metadata } from "next";
import Phrases from "@/components/Phrases";

// The word trainer: the same card screen as the phrases, with words (pipeline/words.py). A screen of the app for one
// learner, not a page for search results (docs/seo.md).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function WordsPage() {
  return <Phrases section="words" />;
}
