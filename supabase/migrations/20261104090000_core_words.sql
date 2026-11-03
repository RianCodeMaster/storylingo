-- Core words: about six words per story that carry the plot. They are taught before the story with a picture,
-- the narrator's voice and their meaning, practised in a short listening game, and then go into review.
-- They belong to the target-language layer; their meaning comes from lexeme_glosses in the learner's base language.

create table story_words (
  story_id  uuid not null references stories (id) on delete cascade,
  lexeme_id uuid not null references lexemes (id),
  position  int  not null,
  primary key (story_id, lexeme_id),
  unique (story_id, position)
);

-- One picture per word, shared by every story and every base language that uses it.
alter table lexemes add column image_asset_id uuid references assets (id);

alter table story_words enable row level security;

create policy "read words of published stories" on story_words
  for select using (exists (
    select 1 from stories s where s.id = story_id and s.status = 'published'));
