import type { Metadata } from "next";
import { Suspense } from "react";
import StoryLoader from "@/components/StoryLoader";
import { getEdition } from "../../dictionaries";

// A screen of the app for one learner, not a page for search results (the public pages are /read, docs/seo.md).
export const metadata: Metadata = { robots: { index: false, follow: true } };

// The story id is only known at request time, so the loader streams in inside Suspense.
export default async function StoryPage() {
  const { dict } = await getEdition();
  return (
    <Suspense fallback={<main><p className="muted">{dict.story.loading}</p></main>}>
      <StoryLoader />
    </Suspense>
  );
}
