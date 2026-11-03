-- Two languages in play: the target language (the stories) and the base language (the app, translations
-- and explanations). Expensive content (story, images, audio) belongs to the target language and is made once;
-- everything the learner reads in their own language moves to a base-language layer, one row per base language.
-- See docs/meertaligheid.md. This migration adds the layer and copies the Dutch texts into it; a later
-- migration drops the old columns once the app and pipeline use the new tables.

-- ---------------------------------------------------------------------------
-- Languages and the pairs on offer
-- ---------------------------------------------------------------------------
alter table languages
  add column direction text    not null default 'ltr' check (direction in ('ltr', 'rtl')),
  add column is_base   boolean not null default false,  -- can be the app language
  add column is_target boolean not null default false;  -- has stories and a voice

update languages set is_base = true where code = 'nl';
update languages set is_target = true where code = 'de';
-- Planned (docs/meertaligheid.md); the flags are switched on when a language is really added.
insert into languages (code, name, direction) values
  ('en', 'English', 'ltr'), ('ar', 'العربية', 'rtl'), ('es', 'Español', 'ltr'), ('fr', 'Français', 'ltr')
on conflict (code) do nothing;

create table language_pairs (
  base_language   text not null references languages (code),
  target_language text not null references languages (code),
  status          text not null default 'planned' check (status in ('planned', 'beta', 'live')),
  primary key (base_language, target_language),
  check (base_language <> target_language)
);

insert into language_pairs (base_language, target_language, status) values
  ('nl', 'de', 'live'),
  ('en', 'de', 'planned'), ('ar', 'de', 'planned'),
  ('nl', 'es', 'planned'), ('de', 'es', 'planned'), ('ar', 'es', 'planned'),
  ('ar', 'en', 'planned');

-- ---------------------------------------------------------------------------
-- The base-language layer
-- ---------------------------------------------------------------------------
create table story_localizations (
  story_id      uuid not null references stories (id) on delete cascade,
  base_language text not null references languages (code),
  summary       text,
  primary key (story_id, base_language)
);

create table scene_localizations (
  scene_id      uuid not null references scenes (id) on delete cascade,
  base_language text not null references languages (code),
  translation   text not null,
  glosses       jsonb not null default '{}',  -- { "<word as written in the scene>": "meaning in this sentence" }
  primary key (scene_id, base_language)
);

-- The general meaning of a word or structure, for the review screen and the target list.
create table lexeme_glosses (
  lexeme_id     uuid not null references lexemes (id) on delete cascade,
  base_language text not null references languages (code),
  gloss         text not null,
  note          text,  -- explanation that fits this base language, e.g. "verb at the end, like 'hoewel'"
  primary key (lexeme_id, base_language)
);

create table gesture_localizations (
  gesture_id    uuid not null references gestures (id) on delete cascade,
  base_language text not null references languages (code),
  description   text not null,
  primary key (gesture_id, base_language)
);

-- ---------------------------------------------------------------------------
-- Copy what exists: everything written so far is Dutch
-- ---------------------------------------------------------------------------
insert into story_localizations (story_id, base_language, summary)
select id, 'nl', summary from stories;

insert into scene_localizations (scene_id, base_language, translation, glosses)
select s.id, 'nl', coalesce(s.translation, ''),
       coalesce((select jsonb_object_agg(e->>'word', e->>'gloss')
                 from jsonb_array_elements(s.glossary) e
                 where e->>'gloss' is not null), '{}')
from scenes s;

insert into lexeme_glosses (lexeme_id, base_language, gloss)
select id, 'nl', gloss from lexemes where gloss is not null;

insert into gesture_localizations (gesture_id, base_language, description)
select id, 'nl', description from gestures;

-- ---------------------------------------------------------------------------
-- Row Level Security: readable like the content it belongs to; written by the pipeline only
-- ---------------------------------------------------------------------------
alter table language_pairs        enable row level security;
alter table story_localizations   enable row level security;
alter table scene_localizations   enable row level security;
alter table lexeme_glosses        enable row level security;
alter table gesture_localizations enable row level security;

create policy "read language pairs"        on language_pairs        for select using (true);
create policy "read lexeme glosses"        on lexeme_glosses        for select using (true);
create policy "read gesture localizations" on gesture_localizations for select using (true);

create policy "read localizations of published stories" on story_localizations
  for select using (exists (
    select 1 from stories s where s.id = story_id and s.status = 'published'));

create policy "read localizations of published scenes" on scene_localizations
  for select using (exists (
    select 1 from scenes sc join stories s on s.id = sc.story_id
    where sc.id = scene_id and s.status = 'published'));
