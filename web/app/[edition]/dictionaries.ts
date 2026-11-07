import { notFound } from "next/navigation";
import { edition as editionParam } from "next/root-params";
import { EDITIONS, isEdition } from "@/lib/editions";
import type { Dictionary } from "@/lib/i18n";

/**
 * The edition of this request (its address: /duits, /almanya …) and the texts of its base language
 * (web/dictionaries/<base>.json); an unknown edition is a 404. Editions come from content/editions (lib/editions.ts),
 * so a new one needs no change here.
 */
export async function getEdition() {
  const slug = await editionParam();
  if (!isEdition(slug)) notFound();
  const edition = EDITIONS[slug];
  const dict = (await import(`@/dictionaries/${edition.base}.json`)).default as Dictionary;
  return { edition, dict };
}
