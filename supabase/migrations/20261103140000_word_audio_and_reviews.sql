-- Review screen: every word can be heard on its own, and every review is logged.

-- Spoken once by the pipeline, shared by every story and every learner.
alter table lexemes
  add column audio_asset_id uuid references assets (id) on delete set null;

create type review_grade as enum ('again', 'hard', 'good');

-- One row per flashcard answer. Together with `answers` this is the learner's evidence of progress.
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  lexeme_id     uuid not null references lexemes (id) on delete cascade,
  grade         review_grade not null,
  interval_days int not null,           -- the new interval this answer produced
  created_at    timestamptz not null default now()
);
create index reviews_user_idx on reviews (user_id, created_at desc);

alter table reviews enable row level security;

create policy "own reviews" on reviews
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
