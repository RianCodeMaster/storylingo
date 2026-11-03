import { Suspense } from "react";
import StoryLoader from "@/components/StoryLoader";
import { getDictionary } from "../../dictionaries";

// The story id is only known at request time, so the loader streams in inside Suspense.
export default async function StoryPage() {
  const { dict } = await getDictionary();
  return (
    <Suspense fallback={<main><p className="muted">{dict.story.loading}</p></main>}>
      <StoryLoader />
    </Suspense>
  );
}
