"""Every edition, read from content/editions/<slug>.yaml: the app as one niche sees it, at its own address.

An edition fixes the base and the target language, has its own welcome texts and color, and picks its stories by
tag and level. The language pairs on offer follow from the editions (`sync` writes language_pairs), and the app
reads web/lib/editions.json, which `sync` writes too.
"""
import json
import re
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

import languages
import yamlio
from models import Level

ROOT = Path(__file__).parent.parent
EDITIONS = ROOT / "content" / "editions"
WEB_FILE = ROOT / "web" / "lib" / "editions.json"

Status = Literal["draft", "beta", "live"]
# Paths the app uses itself; an edition cannot be called like this.
RESERVED = {"story", "review", "sb", "api", "_next"}
# Pages inside an edition; a track cannot be called like this.
EDITION_PAGES = {"story", "stories", "review", "phrases", "p", "account"}
SLUG = r"[a-z][a-z0-9-]*"


class Selection(BaseModel):
    tags: list[str]
    levels: list[Level]


class Track(BaseModel):
    """
    One way into an edition for one niche, at /<edition>/<slug>: the same app and stories, but a welcome that speaks
    to that niche (and to search engines), a start level and the stories it cares about first.
    """
    slug: str
    title: str           # the browser tab and search result title, in the base language
    description: str     # the search result line, in the base language
    tagline: str         # the welcome's big line
    intro: str           # the welcome's few sentences
    level: Level | None = None       # the level chosen on arrival (the learner can still pick another)
    prefer: list[str] = []           # story tags shown first, e.g. [behoerde]
    # Products shown on this track's welcome are named in the product (content/products, tracks:).

    @field_validator("slug")
    @classmethod
    def plain(cls, slug: str) -> str:
        if not re.fullmatch(SLUG, slug) or slug in EDITION_PAGES:
            raise ValueError("lower case letters, digits and - only, and not a page of the edition (story, review …)")
        return slug


class Edition(BaseModel):
    slug: str
    status: Status
    base: str
    target: str
    name: str
    tagline: str
    intro: str
    color: str
    stories: Selection
    domain: str | None = None
    tracks: list[Track] = []

    @field_validator("slug")
    @classmethod
    def plain(cls, slug: str) -> str:
        if not re.fullmatch(SLUG, slug) or slug in RESERVED:
            raise ValueError("lower case letters, digits and - only, and not a word the app uses itself")
        return slug

    @field_validator("color")
    @classmethod
    def hex_color(cls, color: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError("a color like #00d68f")
        return color

    @model_validator(mode="after")
    def known_languages(self):
        # A language can be both (English: the app's language for some, the one learned for others), but never in
        # one edition: the stories would be translated into the language they are written in.
        if self.base == self.target:
            raise ValueError(f"base and target are both '{self.base}': an edition teaches another language")
        if not languages.get(self.base).is_base:
            raise ValueError(f"base '{self.base}' is not a base language (content/languages/{self.base}.yaml)")
        if not languages.get(self.target).is_target:
            raise ValueError(f"target '{self.target}' is not a target language (content/languages/{self.target}.yaml)")
        slugs = [t.slug for t in self.tracks]
        if len(slugs) != len(set(slugs)):
            raise ValueError(f"two tracks share a slug: {slugs}")
        for t in self.tracks:
            if t.level and t.level not in self.stories.levels:
                raise ValueError(f"track '{t.slug}' starts at {t.level}, which the edition does not offer")
            if missing := set(t.prefer) - set(self.stories.tags):
                raise ValueError(f"track '{t.slug}' prefers tags the edition does not have: {sorted(missing)}")
        return self


@cache
def all_editions() -> dict[str, Edition]:
    editions = {}
    for path in sorted(EDITIONS.glob("*.yaml")):
        try:
            edition = Edition.model_validate(yamlio.load(path))
        except SystemExit:
            raise
        except Exception as e:
            raise SystemExit(f"{path.relative_to(ROOT)}: {e}")
        if edition.slug != path.stem:
            raise SystemExit(f"{path.relative_to(ROOT)}: slug '{edition.slug}' must match the file name")
        editions[edition.slug] = edition
    return editions


def pairs() -> dict[tuple[str, str], str]:
    """(base, target) -> the pair's status: the best of its editions (live > beta > planned for drafts only)."""
    rank = {"draft": "planned", "beta": "beta", "live": "live"}
    order = ["planned", "beta", "live"]
    result: dict[tuple[str, str], str] = {}
    for e in all_editions().values():
        status = rank[e.status]
        key = (e.base, e.target)
        if key not in result or order.index(status) > order.index(result[key]):
            result[key] = status
    return result


def web_json() -> str:
    data = {slug: e.model_dump(exclude={"domain"}) for slug, e in all_editions().items()}
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_web() -> bool:
    """Write web/lib/editions.json; True when it changed."""
    text = web_json()
    if WEB_FILE.exists() and WEB_FILE.read_text(encoding="utf-8") == text:
        return False
    WEB_FILE.write_text(text, encoding="utf-8", newline="\n")
    return True
