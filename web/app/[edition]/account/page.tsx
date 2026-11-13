import type { Metadata } from "next";
import { AccountPage } from "@/components/AccountPage";

// A screen of the app for one learner, not a page for search results (the public pages are /read, docs/seo.md).
export const metadata: Metadata = { robots: { index: false, follow: true } };

/** Save your progress with an e-mail code, log in on another device, your packs, logging out (docs/accounts.md). */
export default function Account() {
  return <AccountPage />;
}
