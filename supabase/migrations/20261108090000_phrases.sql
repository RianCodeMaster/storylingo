-- The phrases section (pipeline/phrases.py): per target language and level, the most useful chunks in learning order.
-- A phrase is a lexeme (kind 'phrase'), so it already has audio, meanings per base language (lexeme_glosses) and
-- spaced repetition (user_lexeme_state). This table only says which level it belongs to and where in the order.
create table phrases (
  lexeme_id uuid primary key references lexemes(id) on delete cascade,
  level cefr_level not null,
  position int not null
);
create index phrases_level on phrases (level, position);
alter table phrases enable row level security;
create policy "phrases are public" on phrases for select to anon, authenticated using (true);
