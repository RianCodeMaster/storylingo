"""Writes stories into the database. Uses a direct Postgres connection, which bypasses RLS like the service role."""
import os

import psycopg
from psycopg.types.json import Jsonb

from models import Brief, Localization, Scene, Story

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")


def connect() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def load_story(brief: Brief, story: Story, generation: dict, localizations: dict[str, Localization]) -> str:
    """Insert the story and its base-language layers as a draft in one transaction. A draft with the same slug is replaced."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("select id, status from stories where generation->>'slug' = %s", (brief.slug,))
        existing = cur.fetchone()
        if existing and existing[1] != "draft":
            raise SystemExit(f"Story '{brief.slug}' is already {existing[1]}; refusing to overwrite.")
        if existing:
            cur.execute("delete from stories where id = %s", (existing[0],))

        # Concepts and gestures are shared across stories and languages: upsert by key.
        gestures = {g.concept: g for g in story.gestures}
        lexeme_ids = {}
        for t in brief.targets:
            concept_id = None
            if t.concept:
                cur.execute(
                    "insert into concepts (key) values (%s) on conflict (key) do update set key = excluded.key returning id",
                    (t.concept,),
                )
                concept_id = cur.fetchone()[0]
                if g := gestures.get(t.concept):
                    # Keep an existing gesture: the learner's body memory must stay the same.
                    cur.execute(
                        "insert into gestures (concept_id, emoji) values (%s, %s) on conflict (concept_id) do nothing",
                        (concept_id, g.emoji),
                    )
            cur.execute(
                """insert into lexemes (language_code, concept_id, kind, text, cefr_level)
                   values (%s, %s, %s, %s, %s)
                   on conflict (language_code, text) do update set concept_id = coalesce(lexemes.concept_id, excluded.concept_id)
                   returning id""",
                (brief.language, concept_id, t.kind, t.text, brief.level),
            )
            lexeme_ids[t.text] = cur.fetchone()[0]

        cur.execute(
            """insert into stories (language_code, cefr_level, title, generation)
               values (%s, %s, %s, %s) returning id""",
            (brief.language, brief.level, story.title,
             Jsonb({"slug": brief.slug, "brief": brief.model_dump(), **generation})),
        )
        story_id = cur.fetchone()[0]

        for lexeme_id in lexeme_ids.values():
            cur.execute("insert into story_targets (story_id, lexeme_id) values (%s, %s)", (story_id, lexeme_id))

        for position, scene in enumerate(story.scenes, 1):
            cur.execute(
                """insert into scenes (story_id, position, text, image_prompt, glossary)
                   values (%s, %s, %s, %s, %s) returning id""",
                (story_id, position, scene.text, scene.image_prompt,
                 Jsonb(_glossary_rows(cur, brief.language, scene))),
            )
            scene_id = cur.fetchone()[0]
            for q_pos, q in enumerate(scene.questions, 1):
                cur.execute(
                    """insert into questions (scene_id, position, kind, prompt, options, answer, lexeme_id)
                       values (%s, %s, %s, %s, %s, %s, %s)""",
                    (scene_id, q_pos, q.kind, q.prompt, Jsonb(q.options), Jsonb(q.answer), lexeme_ids.get(q.target)),
                )
        _save_core_words(cur, story_id, brief, story)
        for base, localization in localizations.items():
            _save_localization(cur, story_id, brief, story, base, localization)
        return str(story_id)


def update_core_words(brief: Brief, story: Story) -> None:
    """Replace the core words of a story that is already in the database, also when published."""
    with connect() as conn, conn.cursor() as cur:
        _save_core_words(cur, _story_id(cur, brief.slug), brief, story)


def _save_core_words(cur, story_id, brief: Brief, story: Story) -> None:
    # Core words are glossary words, so their lexemes exist once the scenes are in.
    cur.execute("delete from story_words where story_id = %s", (story_id,))
    for position, word in enumerate(story.core_words, 1):
        cur.execute(
            """insert into story_words (story_id, lexeme_id, position)
               select %s, id, %s from lexemes where language_code = %s and text = %s""",
            (story_id, position, brief.language, word.lemma),
        )


def core_word_plan(slug: str) -> list[tuple[str, str, str | None]]:
    """The core words of a story in order: (lexeme id, lemma, picture asset id or None)."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """select l.id, l.text, l.image_asset_id from story_words w join lexemes l on l.id = w.lexeme_id
               where w.story_id = %s order by w.position""",
            (_story_id(cur, slug),),
        )
        return [(str(r[0]), r[1], r[2]) for r in cur.fetchall()]


def save_localization(brief: Brief, story: Story, base: str, localization: Localization) -> None:
    """Add or replace one base-language layer of a story that is already in the database, also when published."""
    with connect() as conn, conn.cursor() as cur:
        _save_localization(cur, _story_id(cur, brief.slug), brief, story, base, localization)


def _save_localization(cur, story_id, brief: Brief, story: Story, base: str, loc: Localization) -> None:
    cur.execute(
        """insert into story_localizations (story_id, base_language, summary) values (%s, %s, %s)
           on conflict (story_id, base_language) do update set summary = excluded.summary""",
        (story_id, base, loc.summary),
    )
    for position, (scene, scene_loc) in enumerate(zip(story.scenes, loc.scenes), 1):
        cur.execute(
            """insert into scene_localizations (scene_id, base_language, translation, glosses)
               select id, %s, %s, %s from scenes where story_id = %s and position = %s
               on conflict (scene_id, base_language) do update
                 set translation = excluded.translation, glosses = excluded.glosses""",
            (base, scene_loc.translation, Jsonb(scene_loc.glosses), story_id, position),
        )
        # The first meaning a word gets is its general meaning on the review screen.
        for entry in scene.glossary:
            if gloss := scene_loc.glosses.get(entry.word):
                cur.execute(
                    """insert into lexeme_glosses (lexeme_id, base_language, gloss)
                       select id, %s, %s from lexemes where language_code = %s and text = %s
                       on conflict do nothing""",
                    (base, gloss, brief.language, entry.lemma),
                )
    for text, meaning in loc.targets.items():
        cur.execute(
            """insert into lexeme_glosses (lexeme_id, base_language, gloss, note)
               select id, %s, %s, %s from lexemes where language_code = %s and text = %s
               on conflict (lexeme_id, base_language) do update set gloss = excluded.gloss, note = excluded.note""",
            (base, meaning.gloss, meaning.note, brief.language, text),
        )
    # A core word's general meaning beats the meaning it happened to have in its first sentence.
    for lemma, gloss in loc.words.items():
        cur.execute(
            """insert into lexeme_glosses (lexeme_id, base_language, gloss)
               select id, %s, %s from lexemes where language_code = %s and text = %s
               on conflict (lexeme_id, base_language) do update set gloss = excluded.gloss""",
            (base, gloss, brief.language, lemma),
        )
    for concept, description in loc.gestures.items():
        if description:
            # Like the gesture itself, its explanation stays as it was first written.
            cur.execute(
                """insert into gesture_localizations (gesture_id, base_language, description)
                   select g.id, %s, %s from gestures g join concepts c on c.id = g.concept_id where c.key = %s
                   on conflict do nothing""",
                (base, description, concept),
            )


def pair_bases(target: str, statuses: tuple[str, ...] = ("beta", "live")) -> list[str]:
    """The base languages that learn this target language, in pairs with one of these statuses."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "select base_language from language_pairs where target_language = %s and status = any(%s) order by 1",
            (target, list(statuses)),
        )
        return [r[0] for r in cur.fetchall()]


def pair_targets(base: str) -> list[str]:
    """The target languages this base language is paired with, whatever the pair's status."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("select target_language from language_pairs where base_language = %s order by 1", (base,))
        return [r[0] for r in cur.fetchall()]


def _glossary_rows(cur, language: str, scene: Scene) -> list[dict]:
    """Every glossary lemma becomes a lexeme, so a tapped word can enter the learner's review queue."""
    rows = []
    for e in scene.glossary:
        cur.execute(
            """insert into lexemes (language_code, kind, text, cefr_level)
               values (%s, 'word', %s, %s)
               on conflict (language_code, text) do update set text = excluded.text
               returning id""",
            (language, e.lemma, e.level),
        )
        rows.append({"word": e.word, "lemma": e.lemma, "lexeme_id": str(cur.fetchone()[0])})
    return rows


def _story_id(cur, slug: str) -> str:
    cur.execute("select id from stories where generation->>'slug' = %s", (slug,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"No story with slug '{slug}' in the database.")
    return row[0]


def update_glossary(brief: Brief, story: Story) -> None:
    """Replace the glossaries of an existing story in place, also when it is already published."""
    with connect() as conn, conn.cursor() as cur:
        story_id = _story_id(cur, brief.slug)
        for position, scene in enumerate(story.scenes, 1):
            cur.execute(
                "update scenes set glossary = %s where story_id = %s and position = %s",
                (Jsonb(_glossary_rows(cur, brief.language, scene)), story_id, position),
            )


def media_plan(slug: str) -> list[dict]:
    """Per scene: what it says, and which images and audio it already has."""
    with connect() as conn, conn.cursor() as cur:
        story_id = _story_id(cur, slug)
        cur.execute(
            """select sc.id, sc.position, sc.text, sc.image_prompt, sc.image_asset_id, sc.audio_asset_id, img.storage_path
               from scenes sc left join assets img on img.id = sc.image_asset_id
               where sc.story_id = %s order by sc.position""",
            (story_id,),
        )
        scenes = [
            {"id": r[0], "position": r[1], "text": r[2], "image_prompt": r[3],
             "image_asset_id": r[4], "audio_asset_id": r[5], "image_path": r[6], "questions": []}
            for r in cur.fetchall()
        ]
        for scene in scenes:
            cur.execute(
                "select id, position, prompt, audio_asset_id from questions where scene_id = %s order by position",
                (scene["id"],),
            )
            scene["questions"] = [{"id": r[0], "position": r[1], "prompt": r[2], "audio_asset_id": r[3]} for r in cur.fetchall()]
        return scenes


def words_without_audio(slug: str) -> list[tuple[str, str]]:
    """Lexemes of a story (targets and glossary words) that cannot be heard yet: (id, text)."""
    with connect() as conn, conn.cursor() as cur:
        story_id = _story_id(cur, slug)
        cur.execute(
            """select l.id, l.text from lexemes l
               where l.audio_asset_id is null
                 and (l.id in (select lexeme_id from story_targets where story_id = %s)
                      or l.id::text in (select jsonb_array_elements(glossary)->>'lexeme_id'
                                        from scenes where story_id = %s))
               order by l.text""",
            (story_id, story_id),
        )
        return [(str(r[0]), r[1]) for r in cur.fetchall()]


def save_asset(kind: str, path: str, mime_type: str, provider: str, model: str) -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into assets (kind, storage_path, mime_type, provider, model) values (%s, %s, %s, %s, %s)
               on conflict (storage_path) do update
                 set mime_type = excluded.mime_type, provider = excluded.provider, model = excluded.model, created_at = now()
               returning id""",
            (kind, path, mime_type, provider, model),
        )
        return cur.fetchone()[0]


def link_asset(table: str, column: str, row_id: str, asset_id: str) -> None:
    assert (table, column) in {
        ("scenes", "image_asset_id"), ("scenes", "audio_asset_id"),
        ("questions", "audio_asset_id"), ("lexemes", "audio_asset_id"), ("lexemes", "image_asset_id"),
    }
    with connect() as conn, conn.cursor() as cur:
        cur.execute(f"update {table} set {column} = %s where id = %s", (asset_id, row_id))


def clear_media(slug: str, only: str | None = None) -> int:
    """Unlink and forget the images and/or audio of a story (files in storage are overwritten on the next run)."""
    with connect() as conn, conn.cursor() as cur:
        story_id = _story_id(cur, slug)
        if only in (None, "images"):
            cur.execute("update scenes set image_asset_id = null where story_id = %s", (story_id,))
        if only in (None, "audio"):
            cur.execute("update scenes set audio_asset_id = null where story_id = %s", (story_id,))
            cur.execute(
                "update questions set audio_asset_id = null where scene_id in (select id from scenes where story_id = %s)",
                (story_id,),
            )
        kinds = ["image", "audio"] if only is None else [{"images": "image", "audio": "audio"}[only]]
        cur.execute(
            "delete from assets where storage_path like %s and kind = any(%s::asset_kind[])",
            (f"stories/{slug}/%", kinds),
        )
        return cur.rowcount


def publish(slug: str) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "update stories set status = 'published', published_at = now() where generation->>'slug' = %s returning title",
            (slug,),
        )
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"No story with slug '{slug}'.")
        print(f"Published: {row[0]}")


def list_stories() -> list[tuple]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """select generation->>'slug', status, cefr_level, title,
                      (select count(*) from scenes s where s.story_id = stories.id)
               from stories order by created_at"""
        )
        return cur.fetchall()


def base_gaps(base: str) -> list[str]:
    """What the app would miss for learners with this base language, read from the database itself."""
    problems = []
    with connect() as conn, conn.cursor() as cur:
        cur.execute("select is_base from languages where code = %s", (base,))
        row = cur.fetchone()
        if not row:
            return [f"no row in languages for '{base}'"]
        if not row[0]:
            problems.append(f"languages.is_base is false for '{base}'")
        cur.execute("select target_language, status from language_pairs where base_language = %s", (base,))
        pairs = cur.fetchall()
        if not pairs:
            problems.append(f"no language_pairs with base '{base}'")
        # Every check below is per story: (story title, what is missing).
        checks = {
            "no story layer (summary)": """
                select s.title from stories s where s.id = any(%(ids)s) and not exists
                  (select 1 from story_localizations l where l.story_id = s.id and l.base_language = %(base)s)""",
            "scenes without translation": """
                select s.title || ' #' || sc.position from scenes sc join stories s on s.id = sc.story_id
                where s.id = any(%(ids)s) and not exists
                  (select 1 from scene_localizations l where l.scene_id = sc.id and l.base_language = %(base)s
                   and l.translation <> '')""",
            "target structures without meaning": """
                select s.title || ': ' || x.text from story_targets t join stories s on s.id = t.story_id
                join lexemes x on x.id = t.lexeme_id where s.id = any(%(ids)s) and not exists
                  (select 1 from lexeme_glosses g where g.lexeme_id = x.id and g.base_language = %(base)s)""",
            "gestures without explanation": """
                select s.title || ': ' || x.text from story_targets t join stories s on s.id = t.story_id
                join lexemes x on x.id = t.lexeme_id join gestures ge on ge.concept_id = x.concept_id
                where s.id = any(%(ids)s) and not exists
                  (select 1 from gesture_localizations l where l.gesture_id = ge.id and l.base_language = %(base)s)""",
            "core words without meaning": """
                select s.title || ': ' || x.text from story_words w join stories s on s.id = w.story_id
                join lexemes x on x.id = w.lexeme_id where s.id = any(%(ids)s) and not exists
                  (select 1 from lexeme_glosses g where g.lexeme_id = x.id and g.base_language = %(base)s)""",
            "glossary words without meaning (review cards)": """
                select distinct s.title || ': ' || (e->>'lemma') from scenes sc join stories s on s.id = sc.story_id,
                jsonb_array_elements(sc.glossary) e where s.id = any(%(ids)s) and not exists
                  (select 1 from lexeme_glosses g where g.lexeme_id = (e->>'lexeme_id')::uuid
                   and g.base_language = %(base)s)""",
        }
        cur.execute(
            "select array_agg(id) from stories where status = 'published' and language_code = any(%s)",
            ([t for t, _ in pairs],),
        )
        ids = cur.fetchone()[0] or []
        for label, sql in checks.items():
            cur.execute(sql, {"ids": ids, "base": base})
            rows = [r[0] for r in cur.fetchall()]
            if rows:
                problems.append(f"{label}: {len(rows)} -> " + ", ".join(rows[:5]) + (" …" if len(rows) > 5 else ""))
    return problems
