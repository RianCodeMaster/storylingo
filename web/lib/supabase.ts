import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser client. Talks to Supabase through the /sb rewrite on the app's own origin. */
export function supabase(): SupabaseClient {
  if (!client) {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see web/.env.example)");
    client = createClient(`${window.location.origin}/sb`, key);
  }
  return client;
}

let learner: Promise<string> | null = null;

/**
 * Make sure there is a signed-in learner with a profile. Phase 1 uses an anonymous account per browser.
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
  return userId;
}
