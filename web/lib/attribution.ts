import type { Arrival } from "./enrollment";
import { supabase } from "./supabase";

/**
 * Where a learner came in (docs/campagnes.md): the track of the address (/almanya/b1-examen) and the campaign of the
 * link (?utm_campaign=…&utm_source=…). Only the first touch counts: it is kept in this browser per edition, so
 * someone who first came through an ad and later opens /almanya directly still counts for that ad.
 * Nothing leaves the app: it goes into our own tables (visits, enrollments), no outside tracker.
 */
const KEY = (edition: string) => `storylingo.arrival.${edition}`;
const clean = (value: string | null) => (value ? value.trim().toLowerCase().slice(0, 100) || null : null);

const known = (a: Arrival) => !!(a.track || a.campaign || a.source);

export function arrival(edition: string, track: string | null): Arrival {
  const params = new URLSearchParams(window.location.search);
  const now: Arrival = { track, campaign: clean(params.get("utm_campaign")), source: clean(params.get("utm_source")) };
  try {
    const kept = localStorage.getItem(KEY(edition));
    // The first touch that says something wins: a plain visit to /almanya before the ad does not hide the ad.
    if (kept && (known(JSON.parse(kept) as Arrival) || !known(now))) return JSON.parse(kept) as Arrival;
  } catch {
    // Private windows can refuse storage: then this visit simply counts on its own.
  }
  const first = now;
  try {
    localStorage.setItem(KEY(edition), JSON.stringify(first));
  } catch {
    // See above.
  }
  return first;
}

/**
 * The top of the funnel: this learner saw the edition. One row per learner and edition (the first visit's time); its
 * track and campaign follow arrival(), which only ever fills in an empty first touch.
 */
export async function recordVisit(userId: string, edition: string, from: Arrival): Promise<void> {
  const { error } = await supabase()
    .from("visits")
    .upsert({ user_id: userId, edition, ...from }, { onConflict: "user_id,edition", ignoreDuplicates: !known(from) });
  if (error) console.warn("visit not recorded", error.message);
}

/** Whether this learner already asked for the product (then they are thanked instead of asked again). */
export async function onWaitlist(edition: string, product: string): Promise<boolean> {
  const { count } = await supabase()
    .from("waitlist")
    .select("product", { count: "exact", head: true })
    .eq("edition", edition)
    .eq("product", product);
  return !!count;
}

/** Someone wants a product they cannot have yet. */
export async function joinWaitlist(userId: string, edition: string, track: string | null, product: string, email: string) {
  const { error } = await supabase()
    .from("waitlist")
    .upsert({ user_id: userId, edition, track, product, email: email.trim() }, { onConflict: "user_id,edition,product" });
  if (error) throw error;
}
