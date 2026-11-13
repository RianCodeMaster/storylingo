-- Payments with Stripe (docs/stripe.md). The webhook (web/app/api/stripe/webhook) writes purchases with the secret
-- key; nothing here is writable by learners.

-- A learner's customer at Stripe, made at their first checkout and reused after (cards, invoices, the portal).
-- Its own table and not a column of profiles: learners may edit their profile, and whoever could set this could open
-- another customer's billing portal. No policies: only the secret key (the server) reads and writes it.
create table stripe_customers (
  user_id  uuid primary key references profiles(id) on delete cascade,
  customer text not null unique,
  created_at timestamptz not null default now()
);
alter table stripe_customers enable row level security;

-- A subscription is one purchase row that the webhook keeps up to date: every renewal moves valid_until to the end
-- of the new period, cancelling lets it run out, an ended subscription is 'cancelled'. So `owns()` stays right even
-- when a webhook comes late: access simply runs to the end of what was paid (plus a short grace, see the webhook).
alter table purchases add constraint purchases_stripe_subscription_key unique (stripe_subscription);

-- When the learner agreed that Plus starts at once and so gave up the 14-day withdrawal right (EU, digital content).
alter table purchases add column waiver_at timestamptz;
