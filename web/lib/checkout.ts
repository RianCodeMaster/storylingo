import { supabase } from "./supabase";

/**
 * Paying, from the browser's side (docs/stripe.md): ask our server for a Stripe page and go there. The session token
 * says who is paying; the server checks everything else (the product, the price, already owned).
 */
async function post(path: string, body: unknown): Promise<{ url?: string; error?: string }> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "login" };
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({ error: "server" }));
}

/** Go to Stripe's payment page; returns an error code ("account", "owned" …) when that is not possible. */
export async function startCheckout(product: string, interval: string | null, edition: string, waiver: boolean) {
  const { url, error } = await post("/api/checkout", { product, interval, edition, waiver });
  // A full page load: Stripe's page is another site.
  if (url) window.location.href = url;
  return error ?? null;
}

/** Stripe's portal for this learner's subscriptions and invoices. */
export async function openPortal(edition: string) {
  const { url, error } = await post("/api/portal", { edition });
  if (url) window.location.href = url;
  return error ?? null;
}

/** Whether this learner ever paid through Stripe (then the account page offers the portal). */
export async function paidWithStripe(): Promise<boolean> {
  const { count } = await supabase()
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("source", "stripe");
  return (count ?? 0) > 0;
}
