import { Suspense } from "react";
import StoryLoader from "@/components/StoryLoader";

// The story id is only known at request time, so the loader streams in inside Suspense.
export default function StoryPage() {
  return (
    <Suspense fallback={<main><p className="muted">Verhaal laden…</p></main>}>
      <StoryLoader />
    </Suspense>
  );
}
