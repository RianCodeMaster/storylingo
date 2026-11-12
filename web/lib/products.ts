import type { Edition } from "./editions";
import { showsEverything } from "./editions";
import products from "./products.json";
import { supabase } from "./supabase";

/**
 * Every product, generated from content/products/*.yaml by `storylingo.py sync` (never edit products.json by hand).
 * A product is something on top of an edition; its kind says what the app does with it (docs/producten.md).
 * What is shown is decided here, what may be read is decided by the database (only owners can read its stories).
 */
export interface Product {
  slug: string;
  status: "draft" | "coming" | "live";
  kind: "stories" | "phrases" | "exam";
  editions: string[];
  tracks: string[];
  visibility: "everyone" | "owners";
  price: { amount: number; currency: string; interval: "month" | "year" | null } | null;
  tags: string[];
  texts: Record<string, { title: string; text: string; icon: string }>;
}

export const PRODUCTS = products as Record<string, Product>;

/**
 * The products of an edition this learner gets to see: what they have, plus what is offered to everyone (coming or
 * for sale). A draft only for the owner while developing; an owners-only product only once someone has it.
 */
export function visibleProducts(edition: Edition, owned: Set<string>): Product[] {
  return Object.values(PRODUCTS).filter(
    (p) =>
      p.editions.includes(edition.slug) &&
      (owned.has(p.slug) ||
        (p.status === "draft" ? showsEverything() : p.visibility === "everyone")),
  );
}

/** The products a track's welcome shows (the exam ad's page shows the exam training). */
export const trackProducts = (edition: Edition, track: string, owned: Set<string>) =>
  visibleProducts(edition, owned).filter((p) => p.tracks.includes(track));

/** What this learner has now: active purchases that have not run out. */
export async function ownedProducts(): Promise<Set<string>> {
  const { data, error } = await supabase()
    .from("purchases")
    .select("product, valid_until")
    .eq("status", "active");
  if (error) throw error;
  const now = Date.now();
  return new Set(data.filter((p) => !p.valid_until || Date.parse(p.valid_until) > now).map((p) => p.product as string));
}

/** "19,00 €" or "٥٫٠٠ €" in the learner's language, with "/ month" added by the caller for a subscription. */
export function formatPrice(price: NonNullable<Product["price"]>, lang: string): string {
  return new Intl.NumberFormat(lang, { style: "currency", currency: price.currency.toUpperCase() }).format(price.amount / 100);
}
