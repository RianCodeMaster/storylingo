"""The story files in content/stories/<language>/<slug>/: the one source of every story (docs/inhoud-beheer.md).

    story.yaml      the story in its target language: brief, scenes with questions, glossary, voice, core words
    <base>.yaml     everything a learner with that base language reads: translations, meanings, tips, gestures

The database is a copy (storylingo.py sync). Scenes and questions carry fixed keys (s2, s2q3) so the copy can be
updated in place after a text changes: answers, lookups and media stay attached to the same rows.
"""
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yamlio
from models import Brief, Localization, SceneLocalization, Story

ROOT = Path(__file__).parent.parent
STORIES = ROOT / "content" / "stories"

Status = Literal["draft", "published"]

STORY_HEADER = """\
# A story, in its target language. Edit freely, then: storylingo.py sync  (and media / localize / check as it says).
# Keys (s2, s2q3) name a scene or question for good: keep them when you change a text, so learners keep their
# history. A new scene or question may leave its key out; sync gives it one. status: draft or published.
"""
LOCALIZATION_HEADER = """\
# What a learner with this base language reads around the story. Made by `storylingo.py localize`; corrections by
# hand are welcome (then: storylingo.py sync). Each scene names its story.yaml scene (key) and what it was
# translated from (source): when that scene changes, localize translates it again.
"""


@dataclass
class StoryDoc:
    brief: Brief
    story: Story
    status: Status = "draft"
    tags: list[str] = field(default_factory=list)
    generation: dict = field(default_factory=dict)  # how it was made: prompt versions, token counts
    localizations: dict[str, Localization] = field(default_factory=dict)

    @property
    def slug(self) -> str:
        return self.brief.slug

    @property
    def folder(self) -> Path:
        return STORIES / self.brief.language / self.slug


def _new_key(prefix: str, taken: set[str], numbered: bool) -> str:
    """
    A key nobody used before. In a brand-new story the keys are numbered (s1, s1q1); once a story has keys, a new
    one gets a random ending (s1q7f3a). A freed number like s1q3 may still name a removed question in the database,
    with its learners' answers: reusing it would hand that history to a different question.
    """
    n = 1
    while numbered:
        if f"{prefix}{n}" not in taken:
            return f"{prefix}{n}"
        n += 1
    while (key := f"{prefix}{secrets.token_hex(2)}") in taken:
        pass
    return key


def assign_keys(story: Story) -> None:
    """Give every scene and question without a key a new one (see _new_key). Existing keys never change."""
    used = {s.key for s in story.scenes if s.key}
    fresh_story = not used
    for scene in story.scenes:
        if not scene.key:
            scene.key = _new_key("s", used, fresh_story)
            used.add(scene.key)
        taken = {q.key for q in scene.questions if q.key}
        fresh_scene = not taken
        for q in scene.questions:
            if not q.key:
                q.key = _new_key(f"{scene.key}q", taken, fresh_scene)
                taken.add(q.key)
    keys = [s.key for s in story.scenes]
    if len(keys) != len(set(keys)):
        raise SystemExit(f"Two scenes share a key: {keys}")
    for scene in story.scenes:
        qkeys = [q.key for q in scene.questions]
        if len(qkeys) != len(set(qkeys)):
            raise SystemExit(f"Two questions in scene {scene.key} share a key: {qkeys}")


def align(story: Story, loc: Localization) -> Localization:
    """
    Put a layer's scenes in the story's order, matched by scene key; a scene without a translation gets an empty one
    (check and localize then see it as missing). Files written before keys existed follow the story's order.
    """
    by_key = {s.key: s for s in loc.scenes if s.key}
    scenes = []
    for i, scene in enumerate(story.scenes):
        found = by_key.get(scene.key) if by_key else (loc.scenes[i] if i < len(loc.scenes) else None)
        found = found or SceneLocalization(translation="", glosses={})
        found.key = scene.key
        scenes.append(found)
    loc.scenes = scenes
    return loc


def find(slug: str) -> Path:
    matches = list(STORIES.glob(f"*/{slug}/story.yaml"))
    if not matches:
        raise SystemExit(f"No story '{slug}' in content/stories/<language>/.")
    return matches[0].parent


def read(slug: str) -> StoryDoc:
    return _read(find(slug))


def _read(folder: Path) -> StoryDoc:
    where = folder.relative_to(ROOT)
    try:
        data = yamlio.load(folder / "story.yaml")
        brief = Brief.model_validate({"slug": data["slug"], **data["brief"]})
        story = Story.model_validate(data["story"])
    except SystemExit:
        raise
    except Exception as e:
        raise SystemExit(f"{where}/story.yaml: {e}")
    if brief.slug != folder.name or brief.language != folder.parent.name:
        raise SystemExit(f"{where}: slug and language must match the folder (content/stories/<language>/<slug>).")
    localizations = {}
    for path in sorted(folder.glob("*.yaml")):
        if path.name != "story.yaml":
            try:
                localizations[path.stem] = align(story, Localization.model_validate(yamlio.load(path)))
            except Exception as e:
                raise SystemExit(f"{path.relative_to(ROOT)}: {e}")
    return StoryDoc(brief, story, data.get("status", "draft"), data.get("tags", []), data.get("generation", {}),
                    localizations)


def all_stories() -> list[StoryDoc]:
    return [_read(path.parent) for path in sorted(STORIES.glob("*/*/story.yaml"))]


def save(doc: StoryDoc) -> Path:
    """Write the story folder. Keys are given first, so the file and the database always agree."""
    assign_keys(doc.story)
    brief = doc.brief.model_dump(exclude={"slug"}, exclude_none=True)
    data = {
        "slug": doc.slug,
        "status": doc.status,
        "tags": doc.tags,
        "brief": brief,
        "story": doc.story.model_dump(exclude_none=True),
        "generation": doc.generation,
    }
    yamlio.save(doc.folder / "story.yaml", data, STORY_HEADER)
    for base, loc in doc.localizations.items():
        yamlio.save(doc.folder / f"{base}.yaml", loc.model_dump(), LOCALIZATION_HEADER)
    return doc.folder
