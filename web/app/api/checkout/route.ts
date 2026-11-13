import { EDITIONS } from "@/lib/editions";
import { admin, customerOf, json, learnerOf, originOf, stripe } from "@/lib/payments";
import { PRODUCTS } from "@/lib/products";

/**
 * Start paying (docs/stripe.md): the Plus page posts { product, interval, edition, waiver } and gets back the address
 * of Stripe's own payment page. Only for a learner with an account (e-mail): a purchase on an anonymous browser
 * account would be lost with the browser. The price comes from Stripe by its lookup key (storylingo.py stripe), so
 * what is charged is always what Stripe has, never a number sent by the browser.
 */
export async function POST(request: Request) {
  const user = await learnerOf(request);
  if (!user) return json({ error: "login" }, 401);
  if (user.is_anonymous || !user.email) return json({ error: "account" }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    product?: string;
    interval?: string | null;
    edition?: string;
    waiver?: boolean;
  };
  const product = body.product ? PRODUCTS[body.product] : undefined;
  const edition = body.edition ? EDITIONS[body.edition] : undefined;
  const price = product?.prices.find((p) => (p.interval ?? null) === (body.interval ?? null));
  if (!product || !edition || !price || product.status !== "live" || !product.editions.includes(edition.slug)) {
    return json({ error: "product" }, 400);
  }
  // Plus starts at once, so the EU's 14-day withdrawal right only falls away with this explicit yes.
  if (!body.waiver) return json({ error: "waiver" }, 400);

  // Already has it (a second subscription would charge twice).
  const { data: owned } = await admin()
    .from("purchases")
    .select("id")
    .eq("user_id", user.id)
    .eq("product", product.slug)
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .limit(1);
  if (owned?.length) return json({ error: "owned" }, 409);

  const key = `${product.slug}-${price.interval ?? "once"}`;
  const { data: prices } = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (!prices.length) return json({ error: "price" }, 500);

  const back = `${originOf(request)}/${edition.slug}/p/${product.slug}`;
  const metadata = {
    user_id: user.id,
    product: product.slug,
    edition: edition.slug,
    waiver_at: new Date().toISOString(),
  };
  const session = await stripe().checkout.sessions.create({
    mode: price.interval ? "subscription" : "payment",
    customer: await customerOf(user),
    client_reference_id: user.id,
    line_items: [{ price: prices[0].id, quantity: 1 }],
    metadata,
    ...(price.interval ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    // VAT per country of the customer, inside the price (needs Stripe Tax switched on: docs/stripe.md).
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1"
      ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const } }
      : {}),
    allow_promotion_codes: true,
    locale: "auto",
    success_url: `${back}?paid=1`,
    cancel_url: back,
  });
  return json({ url: session.url });
}
