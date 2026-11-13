-- Accounts (docs/accounts.md). Everyone starts anonymous; whoever saves their progress gives an e-mail address and
-- keeps the same account (auth.users gets the address, every row stays theirs). What we keep about a learner beyond
-- what they do in the app is only what they see and chose:

alter table profiles
  -- Yes to tips and offers by e-mail: a real choice, off unless ticked, with the moment it was given (EU law asks
  -- that you can show when someone agreed).
  add column marketing_consent boolean not null default false,
  add column marketing_consent_at timestamptz,
  -- The phone's language (navigator.language, e.g. ar-SY, nl-NL): which audience a campaign reached.
  add column device_language text check (char_length(device_language) <= 20),
  -- When they saved their progress (became a known learner) and were last seen.
  add column account_since timestamptz,
  add column last_seen_at timestamptz;

-- One overview of who a learner is, for the owner only (service role; `storylingo.py learners`).
create view learners with (security_invoker = true) as
select p.id, u.email, u.is_anonymous, p.native_language_code, p.device_language, p.marketing_consent,
       p.created_at, p.account_since, p.last_seen_at,
       (select string_agg(e.edition || coalesce('/' || e.track, '') || coalesce(' (' || e.campaign || ')', ''), ', ')
          from enrollments e where e.user_id = p.id) as came_through,
       (select string_agg(distinct pu.product, ', ') from purchases pu
          where pu.user_id = p.id and pu.status = 'active') as products
from profiles p join auth.users u on u.id = p.id;
revoke all on learners from anon, authenticated;
