import type { Metadata } from "next";
import { Legal, legalTitle } from "@/components/Legal";
import { getEdition } from "../dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { edition } = await getEdition();
  return { title: legalTitle(edition.base, "terms"), alternates: { canonical: `/${edition.slug}/terms` } };
}

export default async function Page() {
  const { edition } = await getEdition();
  return <Legal base={edition.base} which="terms" />;
}
