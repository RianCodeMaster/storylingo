import { EDITIONS } from "@/lib/editions";
import { admin, json, learnerOf, originOf, stripe } from "@/lib/payments";

/**
 * Stripe's customer portal (docs/stripe.md): cancel, change card, download invoices. The account page posts
 * { edition } and gets back the portal's address; the portal leads back to that edition's account page.
 */
export async function POST(request: Request) {
  const user = await learnerOf(request);
  if (!user || user.is_anonymous) return json({ error: "login" }, 401);
  const { edition } = (await request.json().catch(() => ({}))) as { edition?: string };
  if (!edition || !EDITIONS[edition]) return json({ error: "edition" }, 400);
  const { data } = await admin().from("stripe_customers").select("customer").eq("user_id", user.id).maybeSingle();
  if (!data) return json({ error: "none" }, 404);
  const session = await stripe().billingPortal.sessions.create({
    customer: data.customer,
    return_url: `${originOf(request)}/${edition}/account`,
  });
  return json({ url: session.url });
}
