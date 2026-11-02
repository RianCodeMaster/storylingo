-- StoryLingo initial schema
-- Three groups: language knowledge, story content, learner progress.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
create type lexeme_kind as enum ('word', 'phrase', 'structure');
create type asset_kind as enum ('image', 'audio');
create type story_status as enum ('draft', 'published', 'archived');
create type question_kind as enum ('yes_no', 'either_or', 'who_what', 'open');

-- ---------------------------------------------------------------------------
-- Language knowledge
-- ---------------------------------------------------------------------------
create table languages (
  code text primary key,                -- ISO 639-1, e.g. 'de'
  name text not null
);

-- Generated files (images, audio). Cost is tracked per file.
create table assets (
  id           uuid primary key default gen_random_uuid(),
  kind         asset_kind not null,
  storage_path text not null unique,    -- path in Supabase Storage
  mime_type    text not null,
  provider     text,                    -- e.g. 'openai', 'gemini', 'fal'
  model        text,
  cost_usd     numeric(10, 5),
  created_at   timestamptz not null default now()
);

-- A language-neutral meaning, e.g. 'want', 'eat', 'angry'.
create table concepts (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,     -- stable English key
  description text
);

-- The gesture belongs to the concept, so every language reuses it.
create table gestures (
  id             uuid primary key default gen_random_uuid(),
  concept_id     uuid not null unique references concepts (id) on delete cascade,
  description    text not null,         -- how to perform it
  image_asset_id uuid references assets (id)
);

-- How one language expresses a concept (or a grammar structure without one).
create table lexemes (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references languages (code),
  concept_id    uuid references concepts (id),
  kind          lexeme_kind not null,
  text          text not null,          -- e.g. 'wollte', 'aber er konnte nicht'
  gloss         text,                   -- short meaning in the learner's language
  cefr_level    cefr_level not null,
  unique (language_code, text)
);

-- ---------------------------------------------------------------------------
-- Story content (written by the pipeline only)
-- ---------------------------------------------------------------------------
create table stories (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null references languages (code),
  cefr_level     cefr_level not null,
  title          text not null,
  summary        text,
  status         story_status not null default 'draft',
  cover_asset_id uuid references assets (id),
  generation     jsonb,                 -- brief, model, prompt version: how it was made
  created_at     timestamptz not null default now(),
  published_at   timestamptz
);
create index stories_catalog_idx on stories (language_code, cefr_level, status);

-- Which target structures a story practises.
create table story_targets (
  story_id  uuid not null references stories (id) on delete cascade,
  lexeme_id uuid not null references lexemes (id),
  primary key (story_id, lexeme_id)
);

create table scenes (
  id             uuid primary key default gen_random_uuid(),
  story_id       uuid not null references stories (id) on delete cascade,
  position       int not null,
  text           text not null,
  image_asset_id uuid references assets (id),
  audio_asset_id uuid references assets (id),
  unique (story_id, position)
);

-- Circling questions after a scene.
create table questions (
  id             uuid primary key default gen_random_uuid(),
  scene_id       uuid not null references scenes (id) on delete cascade,
  position       int not null,
  kind           question_kind not null,
  prompt         text not null,         -- 'War es ein Hamster oder ein Elefant?'
  options        jsonb,                 -- answer choices for tap answers
  answer         jsonb not null,        -- correct answer(s)
  lexeme_id      uuid references lexemes (id),  -- structure being circled
  audio_asset_id uuid references assets (id),
  unique (scene_id, position)
);

-- ---------------------------------------------------------------------------
-- Learner progress (one row set per user)
-- ---------------------------------------------------------------------------
create table profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text,
  native_language_code text references languages (code),
  created_at           timestamptz not null default now()
);

create table user_languages (
  user_id       uuid not null references profiles (id) on delete cascade,
  language_code text not null references languages (code),
  cefr_level    cefr_level not null,
  primary key (user_id, language_code)
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  story_id     uuid not null references stories (id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index sessions_user_idx on sessions (user_id, started_at desc);

create table answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions (id) on delete cascade,
  question_id uuid not null references questions (id),
  given       jsonb not null,
  is_correct  boolean not null,
  response_ms int,
  created_at  timestamptz not null default now()
);
create index answers_session_idx on answers (session_id);

-- Spaced-repetition state per user per lexeme.
create table user_lexeme_state (
  user_id       uuid not null references profiles (id) on delete cascade,
  lexeme_id     uuid not null references lexemes (id) on delete cascade,
  exposures     int not null default 0,
  correct       int not null default 0,
  ease          numeric(4, 2) not null default 2.50,
  interval_days int not null default 0,
  due_at        timestamptz,
  primary key (user_id, lexeme_id)
);
create index user_lexeme_due_idx on user_lexeme_state (user_id, due_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The pipeline uses the service role, which bypasses RLS. The app uses anon/authenticated.
-- ---------------------------------------------------------------------------
alter table languages         enable row level security;
alter table assets            enable row level security;
alter table concepts          enable row level security;
alter table gestures          enable row level security;
alter table lexemes           enable row level security;
alter table stories           enable row level security;
alter table story_targets     enable row level security;
alter table scenes            enable row level security;
alter table questions         enable row level security;
alter table profiles          enable row level security;
alter table user_languages    enable row level security;
alter table sessions          enable row level security;
alter table answers           enable row level security;
alter table user_lexeme_state enable row level security;

-- Reference data: readable by everyone.
create policy "read languages" on languages for select using (true);
create policy "read assets"    on assets    for select using (true);
create policy "read concepts"  on concepts  for select using (true);
create policy "read gestures"  on gestures  for select using (true);
create policy "read lexemes"   on lexemes   for select using (true);

-- Story content: only published stories are visible.
create policy "read published stories" on stories
  for select using (status = 'published');

create policy "read targets of published stories" on story_targets
  for select using (exists (
    select 1 from stories s where s.id = story_id and s.status = 'published'));

create policy "read scenes of published stories" on scenes
  for select using (exists (
    select 1 from stories s where s.id = story_id and s.status = 'published'));

create policy "read questions of published stories" on questions
  for select using (exists (
    select 1 from scenes sc join stories s on s.id = sc.story_id
    where sc.id = scene_id and s.status = 'published'));

-- Learner tables: own rows only.
create policy "own profile" on profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own languages" on user_languages
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own sessions" on sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own answers" on answers
  for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from sessions s where s.id = session_id and s.user_id = (select auth.uid())));

create policy "own lexeme state" on user_lexeme_state
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Seed: first language
-- ---------------------------------------------------------------------------
insert into languages (code, name) values ('de', 'Deutsch'), ('nl', 'Nederlands');
