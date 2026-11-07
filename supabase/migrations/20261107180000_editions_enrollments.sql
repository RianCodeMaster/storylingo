-- Learners per edition (docs/inhoud-beheer.md, "accounts"). One person has one login (auth.users / profiles), but what
-- they do belongs to an edition: their level, their start, later what they bought. An edition never shows another's.

-- The editions themselves, written by `storylingo.py sync` from content/editions/*.yaml (never by hand).
create table editions (
  slug text primary key,
  status text not null check (status in ('draft', 'beta', 'live')),
  base_language text not null references languages(code),
  target_language text not null references languages(code),
  name text not null,
  check (base_language <> target_language)
);
alter table editions enable row level security;
create policy "editions are public" on editions for select to anon, authenticated using (true);

-- A learner's place in one edition. level: where they are now (chosen at the start, raised when they are ready).
create table enrollments (
  user_id uuid not null references profiles(id) on delete cascade,
  edition text not null references editions(slug),
  level cefr_level not null,
  started_at timestamptz not null default now(),
  level_changed_at timestamptz not null default now(),
  primary key (user_id, edition)
);
alter table enrollments enable row level security;
create policy "own enrollments" on enrollments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Which edition a play session happened in (a story can be in several editions with the same target language).
alter table sessions add column edition text references editions(slug);

-- Replaced by enrollments (never used: it held a level per language, not per edition).
drop table user_languages;
