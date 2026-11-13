import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Where Supabase is. Online: its own address (NEXT_PUBLIC_SUPABASE_URL), so pictures and audio come straight from
 * Supabase's CDN. Locally: through the /sb rewrite on the app's own origin, so a phone on the home network works too.
 */
export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || `${window.location.origin}/sb`;
}

/** A public file in the assets bucket (images, narration, the teacher's reactions). */
export const publicFile = (path: string) => `${supabaseUrl()}/storage/v1/object/public/assets/${path}`;

/** Browser client. */
export function supabase(): SupabaseClient {
  if (!client) {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see web/.env.example)");
    client = createClient(supabaseUrl(), key);
  }
  return client;
}

let learner: Promise<string> | null = null;

/**
 * Make sure there is a signed-in learner with a profile: their account, or else a new anonymous one for this browser
 * (lib/account.ts turns that into an e-mail account when they save their progress).
 * A new profile gets the base language of the pages it signed up on.
 */
export function ensureLearner(base: string): Promise<string> {
  // Share one sign-in between simultaneous callers, otherwise each would create its own anonymous account.
  learner ??= signInLearner(base).catch((e) => {
    learner = null;
    throw e;
  });
  return learner;
}

async function signInLearner(base: string): Promise<string> {
  const sb = supabase();
  // getUser checks with the server, so a stale browser session (e.g. after a database reset) is replaced.
  const { data, error: userError } = await sb.auth.getUser();
  if (userError) await sb.auth.signOut({ scope: "local" });
  let userId = userError ? undefined : data.user?.id;
  if (!userId) {
    const { data: signIn, error } = await sb.auth.signInAnonymously();
    if (error || !signIn.user) throw error ?? new Error("Anonymous sign-in failed");
    userId = signIn.user.id;
  }
  const { error } = await sb
    .from("profiles")
    .upsert({ id: userId, native_language_code: base }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  // When they were last here, and the phone's language (which audience a campaign reached). Best effort.
  void sb
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString(), device_language: navigator.language.slice(0, 20) })
    .eq("id", userId)
    .then(() => {}, () => {});
  return userId;
}
