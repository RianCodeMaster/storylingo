-- Tap any word: every scene carries a glossary, and every tap is logged so the word can be reviewed later.

-- [{ "word": "Käfig", "lemma": "der Käfig", "gloss": "kooi", "lexeme_id": "..." }, ...]
alter table scenes
  add column glossary jsonb not null default '[]';

create table word_lookups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  lexeme_id  uuid not null references lexemes (id) on delete cascade,
  scene_id   uuid references scenes (id) on delete set null,
  session_id uuid references sessions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index word_lookups_user_idx on word_lookups (user_id, created_at desc);

alter table word_lookups enable row level security;

create policy "own lookups" on word_lookups
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
