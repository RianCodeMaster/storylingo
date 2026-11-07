-- Content lives as files in content/ and `storylingo.py sync` updates the database in place (docs/inhoud-beheer.md).
-- Stable keys let sync recognise a story, scene or question after its text changed, so learner progress stays.

-- The story's own name from its folder, instead of generation->>'slug'; tags choose the stories of an edition.
alter table stories add column slug text;
update stories set slug = generation->>'slug';
alter table stories alter column slug set not null, add constraint stories_slug_key unique (slug);
alter table stories add column tags text[] not null default '{}';

-- Scene and question keys as written in story.yaml (s1, s1q2). Existing rows get the keys the files will have.
alter table scenes add column key text;
update scenes set key = 's' || position;
alter table scenes alter column key set not null, add constraint scenes_story_key unique (story_id, key);

alter table questions add column key text;
update questions q set key = 's' || s.position || 'q' || q.position from scenes s where s.id = q.scene_id;
alter table questions alter column key set not null, add constraint questions_scene_key unique (scene_id, key);

-- A question removed from the file after learners answered it is hidden, not deleted: their history stays.
alter table questions add column retired boolean not null default false;

-- Positions are reordered inside one sync: check them at the end of the transaction, not per row.
alter table scenes drop constraint scenes_story_id_position_key,
  add constraint scenes_story_id_position_key unique (story_id, position) deferrable initially deferred;
alter table questions drop constraint questions_scene_id_position_key,
  add constraint questions_scene_id_position_key unique (scene_id, position) deferrable initially deferred;
