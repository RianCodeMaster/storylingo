-- The app and pipeline now read and write the base-language layer (previous migration). The old columns,
-- which could hold only one (Dutch) text, go.

alter table stories  drop column summary;
alter table scenes   drop column translation;
alter table lexemes  drop column gloss;
alter table gestures drop column description;

-- The glossary keeps the words of the story; their meanings live in scene_localizations.glosses.
update scenes
set glossary = coalesce((select jsonb_agg(e - 'gloss') from jsonb_array_elements(glossary) e), '[]');
