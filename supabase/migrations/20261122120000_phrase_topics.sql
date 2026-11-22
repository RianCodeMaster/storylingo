-- Phrases per topic (pipeline/phrases.py, TOPICS): a video about the doctor leads to the doctor's phrases.
-- topics: one or two of health, work, office, shopping, housing, travel, social, everyday (the first is the main one).
-- topic_rank: the phrase's place within its topic at its level (with two topics the better place), written by sync.
alter table phrases
  add column topics text[] not null default '{}',
  add column topic_rank int;

-- The free tier opens per level the first phrases (phrases_per_level) and now also the first few of every topic
-- (phrases_per_topic), so whoever comes from a topic video gets one full round of what it promised. Plus: all.
drop policy "free phrases, all with plus" on phrases;
create policy "free phrases, all with plus" on phrases
  for select to anon, authenticated using (
    exists (
      select 1 from lexemes l where l.id = lexeme_id
        and (phrases.position <= coalesce(free_limit(l.language_code, 'phrases_per_level'), 2147483647)
             or phrases.topic_rank <= coalesce(free_limit(l.language_code, 'phrases_per_topic'), 2147483647)
             or has_plus(l.language_code))));

-- How many phrases each level has per topic, also the locked ones ("10 of 24").
create view phrase_topic_counts as
select l.language_code, p.level, t.topic, count(*)::int as total
from phrases p
join lexemes l on l.id = p.lexeme_id
cross join lateral unnest(p.topics) as t(topic)
group by l.language_code, p.level, t.topic;
grant select on phrase_topic_counts to anon, authenticated;
