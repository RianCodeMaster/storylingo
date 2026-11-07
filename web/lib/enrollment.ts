import { supabase } from "./supabase";

/**
 * A learner's place in one edition (table enrollments): one login per person, but their level and progress belong
 * to the edition they play in. No enrollment yet means a first visit: the edition shows its welcome.
 */
export interface Enrollment {
  edition: string;
  level: string;
}

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export async function getEnrollment(edition: string): Promise<Enrollment | null> {
  const { data, error } = await supabase().from("enrollments").select("edition, level").eq("edition", edition).maybeSingle();
  if (error) throw error;
  return data;
}

/** Start in an edition at a level, or move to another level later. */
export async function setLevel(userId: string, edition: string, level: string): Promise<Enrollment> {
  const { data, error } = await supabase()
    .from("enrollments")
    .upsert({ user_id: userId, edition, level, level_changed_at: new Date().toISOString() }, { onConflict: "user_id,edition" })
    .select("edition, level")
    .single();
  if (error) throw error;
  return data;
}
