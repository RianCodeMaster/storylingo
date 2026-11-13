import type { Metadata } from "next";
import Review from "@/components/Review";

// A screen of the app for one learner, not a page for search results (the public pages are /read, docs/seo.md).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function ReviewPage() {
  return <Review />;
}
