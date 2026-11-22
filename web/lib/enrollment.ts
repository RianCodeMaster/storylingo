import { supabase } from "./supabase";

/**
 * A learner's place in one edition (table enrollments): one login per person, but their level and progress belong
 * to the edition they play in. No enrollment yet means a first visit: the edition shows its welcome.
 */
export interface Enrollment {
  edition: string;
  level: string;
  track: string | null;
}

/** Where a learner came in (lib/attribution.ts): kept with their enrollment when they start. */
export interface Arrival {
  track: string | null;
  campaign: string | null;
  source: string | null;
}

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

/**
 * The edition this learner was busy with last: where they last played a story, else where they last started or
 * changed level. After logging in on another device or browser they go there, so someone learning German from
 * Dutch does not end up in the English edition because their new browser speaks English.
 */
export async function lastEdition(): Promise<string | null> {
  const played = await supabase().from("sessions").select("edition").order("started_at", { ascending: false }).limit(1);
  if (played.data?.[0]?.edition) return played.data[0].edition as string;
  const enrolled = await supabase()
    .from("enrollments")
    .select("edition")
    .order("level_changed_at", { ascending: false })
    .limit(1);
  return (enrolled.data?.[0]?.edition as string | undefined) ?? null;
}

export async function getEnrollment(edition: string): Promise<Enrollment | null> {
  const { data, error } = await supabase().from("enrollments").select("edition, level, track").eq("edition", edition).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Start in an edition at a level, or move to another level later. Only the start passes `arrival`, so a later level
 * change never overwrites where the learner came in.
 */
export async function setLevel(userId: string, edition: string, level: string, arrival?: Arrival): Promise<Enrollment> {
  const { data, error } = await supabase()
    .from("enrollments")
    .upsert(
      { user_id: userId, edition, level, level_changed_at: new Date().toISOString(), ...arrival },
      { onConflict: "user_id,edition" },
    )
    .select("edition, level, track")
    .single();
  if (error) throw error;
  return data;
}
