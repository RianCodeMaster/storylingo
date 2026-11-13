import { supabase } from "./supabase";

/**
 * Accounts (docs/accounts.md). Everyone starts without one: an anonymous account per browser, made on the first visit,
 * so learning starts with one tap. Whoever wants to keep their progress (or buys something) gives an e-mail address
 * and gets a 6-digit code; there are no passwords. One e-mail field covers both cases:
 *
 * - new address: this browser's anonymous account gets the address (Supabase "email change"), so every story,
 *   word and level stays where it is;
 * - known address: the learner already has an account (another phone): they log in to it with the code. What this
 *   browser did anonymously stays behind (usually a first look, nothing more).
 */
export interface Account {
  id: string;
  email: string | null;
  anonymous: boolean;
}

export type CodeFor = "save" | "login";

export async function currentAccount(): Promise<Account | null> {
  const { data } = await supabase().auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, anonymous: !!data.user.is_anonymous };
}

/** Send a code to `email`: to save this account under it, or, if it already has an account, to log in to that. */
export async function sendCode(email: string): Promise<CodeFor> {
  const sb = supabase();
  const address = email.trim().toLowerCase();
  const { error } = await sb.auth.updateUser({ email: address });
  if (!error) return "save";
  if (error.code !== "email_exists" && !/already been registered/i.test(error.message)) throw error;
  const { error: loginError } = await sb.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
  if (loginError) throw loginError;
  return "login";
}

/** Check the code. After saving, the account is known from now on; after logging in, this browser is that account. */
export async function verifyCode(email: string, code: string, codeFor: CodeFor, marketing: boolean): Promise<void> {
  const sb = supabase();
  const { data, error } = await sb.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: codeFor === "save" ? "email_change" : "email",
  });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) return;
  const now = new Date().toISOString();
  // Saving: from now on a known learner. A yes to tips is only ever stored when ticked, with its moment.
  const update: Record<string, unknown> = codeFor === "save" ? { account_since: now } : {};
  if (marketing) Object.assign(update, { marketing_consent: true, marketing_consent_at: now });
  if (Object.keys(update).length) await sb.from("profiles").update(update).eq("id", id);
}

/** Yes or no to tips and offers by e-mail, changeable at any time. */
export async function setMarketing(id: string, yes: boolean): Promise<void> {
  const { error } = await supabase()
    .from("profiles")
    .update({ marketing_consent: yes, marketing_consent_at: yes ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function marketingConsent(id: string): Promise<boolean> {
  const { data } = await supabase().from("profiles").select("marketing_consent").eq("id", id).maybeSingle();
  return !!data?.marketing_consent;
}

/** Log out: the account keeps everything; this browser starts again as a new, anonymous learner. */
export async function logOut(): Promise<void> {
  await supabase().auth.signOut();
}
