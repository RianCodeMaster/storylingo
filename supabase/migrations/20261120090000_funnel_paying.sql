-- The paying end of the funnel (docs/campagnes.md): per campaign, how many opened a product page (Plus), how many
-- clicked pay and went to Stripe, and how many paid. The first two are moments on the learner's own visit row (the
-- first time only); paying is read from purchases, so it is never counted twice.
alter table visits
  add column product_seen_at timestamptz,
  add column checkout_at timestamptz;

create or replace view funnel with (security_invoker = true) as
with people as (
  select v.edition, coalesce(v.track, '') as track, coalesce(v.campaign, '') as campaign, v.user_id, v.visited_at,
         v.product_seen_at, v.checkout_at
  from visits v
),
played as (
  select s.user_id, s.edition,
         count(*) filter (where s.completed_at is not null) as finished,
         max(s.started_at) as last_played
  from sessions s
  group by s.user_id, s.edition
)
select p.edition, p.track, p.campaign,
       count(*) as visitors,
       count(e.user_id) as started,
       count(*) filter (where pl.finished > 0) as finished_a_story,
       count(*) filter (where pl.last_played >= p.visited_at + interval '7 days') as back_after_a_week,
       count(*) filter (where exists (select 1 from waitlist w where w.user_id = p.user_id and w.edition = p.edition))
         as waitlist,
       count(p.product_seen_at) as saw_product,
       count(p.checkout_at) as went_to_pay,
       -- Paid through Stripe in this edition (a gift or code is not a sale); still counted after cancelling.
       count(*) filter (where exists (select 1 from purchases pu where pu.user_id = p.user_id
                                      and pu.edition = p.edition and pu.source = 'stripe')) as paid
from people p
left join enrollments e on e.user_id = p.user_id and e.edition = p.edition
left join played pl on pl.user_id = p.user_id and pl.edition = p.edition
group by p.edition, p.track, p.campaign;
revoke all on funnel from anon, authenticated;
