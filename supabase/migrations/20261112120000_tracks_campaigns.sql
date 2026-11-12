-- Tracks and campaigns (docs/campagnes.md). A track is one way into an edition for one niche (/almanya/b1-examen):
-- its own welcome texts, start level and stories first. A campaign is the ad or video a learner came from
-- (?utm_campaign=…). Both are remembered from the first visit, so every later step (a story started, finished,
-- coming back, paying) can be counted per niche without any outside tracker.

-- Every first visit to an edition, whether or not the learner starts: the top of the funnel.
create table visits (
  user_id uuid not null references profiles(id) on delete cascade,
  edition text not null references editions(slug),
  track text,
  campaign text check (char_length(campaign) <= 100),
  source text check (char_length(source) <= 100),
  visited_at timestamptz not null default now(),
  primary key (user_id, edition)
);
alter table visits enable row level security;
create policy "own visits" on visits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Where a learner came in: written once, when they start (later level changes leave it alone).
alter table enrollments
  add column track text,
  add column campaign text check (char_length(campaign) <= 100),
  add column source text check (char_length(source) <= 100);

-- People who want a course that does not exist yet (e.g. DTZ exam training): demand measured before it is built.
create table waitlist (
  user_id uuid not null references profiles(id) on delete cascade,
  edition text not null references editions(slug),
  track text,
  course text not null check (char_length(course) <= 50),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, edition, course)
);
alter table waitlist enable row level security;
create policy "own waitlist" on waitlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Per edition, track and campaign: how many came, started, finished a story, came back after a week, and want the
-- course. Read by `storylingo.py funnel` (service role); learners cannot see it.
create view funnel with (security_invoker = true) as
with people as (
  select v.edition, coalesce(v.track, '') as track, coalesce(v.campaign, '') as campaign, v.user_id, v.visited_at
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
         as waitlist
from people p
left join enrollments e on e.user_id = p.user_id and e.edition = p.edition
left join played pl on pl.user_id = p.user_id and pl.edition = p.edition
group by p.edition, p.track, p.campaign;
revoke all on funnel from anon, authenticated;
