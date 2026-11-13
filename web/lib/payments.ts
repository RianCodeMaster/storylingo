import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Server-only helpers for paying (docs/stripe.md): Stripe with the secret key, Supabase with its secret key (it writes
 * purchases, which learners cannot), and who is asking. Never import this from a client component: the keys would
 * not be there (they have no NEXT_PUBLIC_ prefix) and the request would fail on purpose.
 */

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient ??= new Stripe(key);
  return stripeClient;
}

let adminClient: SupabaseClient | null = null;
/** Supabase as the owner: bypasses row level security. Only for what learners may not do themselves. */
export function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_LOCAL_URL || "http://127.0.0.1:54321";
  adminClient ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

/** The learner behind a request: the app sends its Supabase session token, and Supabase says whose it is. */
export async function learnerOf(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

/** The learner's customer at Stripe; made at their first checkout and remembered (table stripe_customers). */
export async function customerOf(user: User): Promise<string> {
  const db = admin();
  const { data } = await db.from("stripe_customers").select("customer").eq("user_id", user.id).maybeSingle();
  if (data) return data.customer;
  const customer = await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } });
  const { error } = await db.from("stripe_customers").insert({ user_id: user.id, customer: customer.id });
  if (error) throw error;
  return customer.id;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Where the learner goes back to: the address this request came from, so it works locally, on a preview and live. */
export const originOf = (request: Request) => new URL(request.url).origin;
