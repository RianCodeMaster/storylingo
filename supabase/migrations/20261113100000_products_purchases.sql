-- Products and purchases (docs/producten.md). A product is written by `storylingo.py sync` from
-- content/products/*.yaml; a purchase says who has it, how they got it and until when. The database itself decides
-- who may read a product's content: a story that belongs to a product is readable only for whoever has it, and the
-- scenes, questions and translations follow the story (their policies look it up in stories).

create table products (
  slug text primary key,
  status text not null check (status in ('draft', 'coming', 'live')),
  kind text not null,
  visibility text not null check (visibility in ('everyone', 'owners')),
  editions text[] not null,
  price_amount integer,
  price_currency text,
  price_interval text check (price_interval in ('month', 'year'))
);
alter table products enable row level security;
-- Not readable through the API: the app has the products in web/lib/products.json; this table is for the database.

-- Who has what. source: how they got it (stripe, manual: given by the owner, gift, trial). One row per acquisition,
-- so a renewal or a second purchase is history, not an overwrite.
create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product text not null references products(slug),
  edition text references editions(slug),
  source text not null check (source in ('stripe', 'manual', 'gift', 'trial')),
  status text not null default 'active' check (status in ('active', 'refunded', 'cancelled')),
  amount integer,
  currency text,
  valid_until timestamptz,                      -- null: for good
  stripe_session text unique,
  stripe_subscription text,
  note text,
  created_at timestamptz not null default now()
);
create index purchases_user_idx on purchases (user_id);
alter table purchases enable row level security;
-- A learner sees their own purchases; only the owner (service role: Stripe webhook, `storylingo.py grant`) writes them.
create policy "own purchases" on purchases for select to authenticated using (user_id = (select auth.uid()));

-- Whether the current learner has a product now.
create function owns(product_slug text) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from purchases
      where user_id = auth.uid() and product = product_slug and status = 'active'
        and (valid_until is null or valid_until > now()))
  $$;
revoke all on function owns(text) from public;
grant execute on function owns(text) to anon, authenticated;

-- A story can belong to a product (set by sync from the product's tags); then only its owners can read it.
alter table stories add column product text references products(slug);
drop policy "read published stories" on stories;
create policy "read published stories" on stories
  for select using (status = 'published' and (product is null or owns(product)));

-- The waitlist names a product now (it was a free 'course' key).
alter table waitlist rename column course to product;
