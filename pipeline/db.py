"""Writes stories into the database. Uses a direct Postgres connection, which bypasses RLS like the service role."""
import os

import psycopg
from psycopg.types.json import Jsonb

from models import Brief, Scene, Story

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")


def connect() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def load_story(brief: Brief, story: Story, generation: dict) -> str:
    """Insert the story as a draft in one transaction. A draft with the same slug is replaced."""
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
                        "insert into gestures (concept_id, description, emoji) values (%s, %s, %s) on conflict (concept_id) do nothing",
                        (concept_id, g.description, g.emoji),
                    )
            cur.execute(
                """insert into lexemes (language_code, concept_id, kind, text, gloss, cefr_level)
                   values (%s, %s, %s, %s, %s, %s)
                   on conflict (language_code, text) do update set gloss = excluded.gloss
                   returning id""",
                (brief.language, concept_id, t.kind, t.text, t.gloss, brief.level),
            )
            lexeme_ids[t.text] = cur.fetchone()[0]

        cur.execute(
            """insert into stories (language_code, cefr_level, title, summary, generation)
               values (%s, %s, %s, %s, %s) returning id""",
            (brief.language, brief.level, story.title, story.summary,
             Jsonb({"slug": brief.slug, "brief": brief.model_dump(), **generation})),
        )
        story_id = cur.fetchone()[0]

        for lexeme_id in lexeme_ids.values():
            cur.execute("insert into story_targets (story_id, lexeme_id) values (%s, %s)", (story_id, lexeme_id))

        for position, scene in enumerate(story.scenes, 1):
            cur.execute(
                """insert into scenes (story_id, position, text, translation, image_prompt, glossary)
                   values (%s, %s, %s, %s, %s, %s) returning id""",
                (story_id, position, scene.text, scene.translation, scene.image_prompt,
                 Jsonb(_glossary_rows(cur, brief.language, scene))),
            )
            scene_id = cur.fetchone()[0]
            for q_pos, q in enumerate(scene.questions, 1):
                cur.execute(
                    """insert into questions (scene_id, position, kind, prompt, options, answer, lexeme_id)
                       values (%s, %s, %s, %s, %s, %s, %s)""",
                    (scene_id, q_pos, q.kind, q.prompt, Jsonb(q.options), Jsonb(q.answer), lexeme_ids.get(q.target)),
                )
        return str(story_id)


def _glossary_rows(cur, language: str, scene: Scene) -> list[dict]:
    """Every glossary lemma becomes a lexeme, so a tapped word can enter the learner's review queue."""
    rows = []
    for e in scene.glossary:
        cur.execute(
            """insert into lexemes (language_code, kind, text, gloss, cefr_level)
               values (%s, 'word', %s, %s, %s)
               on conflict (language_code, text) do update set text = excluded.text
               returning id""",
            (language, e.lemma, e.gloss, e.level),
        )
        rows.append({"word": e.word, "lemma": e.lemma, "gloss": e.gloss, "lexeme_id": str(cur.fetchone()[0])})
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
    assert (table, column) in {("scenes", "image_asset_id"), ("scenes", "audio_asset_id"), ("questions", "audio_asset_id")}
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
