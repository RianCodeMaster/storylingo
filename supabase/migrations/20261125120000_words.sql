-- The word trainer (pipeline/words.py): per target language and level the most useful words, most useful first, each
-- with an example sentence. Like a phrase, a word is a lexeme (kind 'word'), so it already has audio, meanings per base
-- language (lexeme_glosses) and spaced repetition (user_lexeme_state); a word a story brought in is the same lexeme.
-- This table says which level it belongs to, where in the order, its topics and its example.
create table words (
  lexeme_id  uuid primary key references lexemes(id) on delete cascade,
  level      cefr_level not null,
  position   int not null,
  topics     text[] not null default '{}',
  topic_rank int,
  example    text not null
);
create index words_level on words (level, position);
alter table words enable row level security;

-- The example sentence in the learner's base language, next to the word's meaning.
alter table lexeme_glosses add column example text;

-- The free tier opens per level the first words (words_per_level) and the first few of every topic (words_per_topic),
-- like the phrases; Plus opens all. A language without these limits in its membership has none.
create policy "free words, all with plus" on words
  for select to anon, authenticated using (
    exists (
      select 1 from lexemes l where l.id = lexeme_id
        and (words.position <= coalesce(free_limit(l.language_code, 'words_per_level'), 2147483647)
             or words.topic_rank <= coalesce(free_limit(l.language_code, 'words_per_topic'), 2147483647)
             or has_plus(l.language_code))));

-- How many words each level has, in all and per topic, also the locked ones ("50 of 500").
create view word_counts as
select l.language_code, w.level, count(*)::int as total
from words w join lexemes l on l.id = w.lexeme_id
group by l.language_code, w.level;
grant select on word_counts to anon, authenticated;

create view word_topic_counts as
select l.language_code, w.level, t.topic, count(*)::int as total
from words w
join lexemes l on l.id = w.lexeme_id
cross join lateral unnest(w.topics) as t(topic)
group by l.language_code, w.level, t.topic;
grant select on word_topic_counts to anon, authenticated;
