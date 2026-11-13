import type Stripe from "stripe";
import { admin, stripe } from "@/lib/payments";

/**
 * What Stripe tells us after a payment (docs/stripe.md); set up in Stripe > Developers > Webhooks with the address
 * https://<domain>/api/stripe/webhook. The signature proves the message is Stripe's; then the purchase is written:
 *
 * - a subscription: one row, kept up to date by every change (renewal, cancelling, ending);
 * - a one-off payment: one row for good, once the payment is in.
 *
 * Stripe sends a message again when we did not answer 200, and may send one twice, so every write is an upsert.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("not configured", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        // Usually the subscription's own event comes too; writing it here as well makes access instant.
        await saveSubscription(await stripe().subscriptions.retrieve(session.subscription));
      } else if (session.mode === "payment" && session.payment_status === "paid") {
        await saveOneOff(session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await saveSubscription(event.data.object);
      break;
  }
  return new Response("ok");
}

// A renewal is charged at the end of a period and its message can take a moment; access runs a little longer, so
// nobody loses Plus for an hour while their card is being charged.
const GRACE_MS = 2 * 24 * 60 * 60 * 1000;

async function saveSubscription(sub: Stripe.Subscription) {
  const { user_id, product, edition, waiver_at } = sub.metadata;
  if (!user_id || !product) return; // not one of ours (made in the dashboard by hand)
  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end;
  const ended = ["canceled", "incomplete_expired", "unpaid"].includes(sub.status);
  const until = ended
    ? new Date((sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000)
    : sub.status === "incomplete"
      ? new Date() // first payment not through yet: no access until it is
      : new Date((periodEnd ?? 0) * 1000 + GRACE_MS);
  const { error } = await admin()
    .from("purchases")
    .upsert(
      {
        user_id,
        product,
        edition: edition || null,
        source: "stripe",
        status: ended ? "cancelled" : "active",
        amount: item?.price.unit_amount ?? null,
        currency: item?.price.currency ?? null,
        valid_until: until.toISOString(),
        stripe_subscription: sub.id,
        waiver_at: waiver_at || null,
      },
      { onConflict: "stripe_subscription" },
    );
  if (error) throw error;
}

async function saveOneOff(session: Stripe.Checkout.Session) {
  const { user_id, product, edition, waiver_at } = session.metadata ?? {};
  if (!user_id || !product) return;
  const { error } = await admin()
    .from("purchases")
    .upsert(
      {
        user_id,
        product,
        edition: edition || null,
        source: "stripe",
        status: "active",
        amount: session.amount_total,
        currency: session.currency,
        valid_until: null,
        stripe_session: session.id,
        waiver_at: waiver_at || null,
      },
      { onConflict: "stripe_session" },
    );
  if (error) throw error;
}
