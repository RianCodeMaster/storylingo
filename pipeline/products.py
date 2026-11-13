"""Every product, read from content/products/<slug>.yaml: something a learner can get on top of an edition.

A product has a kind (what the app does with it) and content of that kind. A product of a kind that exists needs only
its file and its content; a new kind needs code once (docs/producten.md). `sync` writes the products table (the
database decides who may read a product's content) and web/lib/products.json (what the app shows).
"""
import json
import re
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

import editions
import yamlio

ROOT = Path(__file__).parent.parent
PRODUCTS = ROOT / "content" / "products"
WEB_FILE = ROOT / "web" / "lib" / "products.json"

Status = Literal["draft", "coming", "live"]
# What the app can do with a product. stories: published stories with one of the product's tags, only for owners.
# membership (Plus): everything of its target languages without limits; without it the `free` limits apply.
# phrases and exam are planned: such a product can be draft or coming (a waitlist), not yet live.
Kind = Literal["stories", "membership", "phrases", "exam"]
BUILT: set[str] = {"stories", "membership"}


class Price(BaseModel):
    amount: int                                   # in cents: 1900 = 19,00
    currency: Literal["eur"] = "eur"
    interval: Literal["month", "year"] | None = None   # None: paid once


class Text(BaseModel):
    """What the learner reads, in one base language."""
    title: str
    text: str            # one or two lines: what it gives
    icon: str = "🎁"
    perks: list[str] = []   # what you get, one line each (the product page lists them)


class Free(BaseModel):
    """
    What a learner without the membership gets of its target languages (docs/plus.md). Per level the first stories
    and phrases (in learning order); per day a few new ones. Replaying a story or a phrase already learned is free.
    """
    stories_per_level: int = 2
    stories_per_day: int = 1
    phrases_per_level: int = 30
    phrases_per_day: int = 10
    reviews_per_day: int = 20


class Product(BaseModel):
    slug: str
    status: Status
    kind: Kind
    editions: list[str]                           # where it is offered
    tracks: list[str] = []                        # tracks (of those editions) whose welcome shows it
    visibility: Literal["everyone", "owners"] = "everyone"   # owners: invisible until someone has it
    prices: list[Price] = []                      # one or more: e.g. per month and per year
    tags: list[str] = []                          # kind stories: the stories that belong to it
    free: Free | None = None                      # kind membership: what is free without it
    texts: dict[str, Text]                        # per base language of its editions

    @field_validator("slug")
    @classmethod
    def plain(cls, slug: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9-]*", slug):
            raise ValueError("lower case letters, digits and - only")
        return slug

    @model_validator(mode="after")
    def consistent(self):
        known = editions.all_editions()
        for slug in self.editions:
            if slug not in known:
                raise ValueError(f"edition '{slug}' does not exist (content/editions)")
            if known[slug].base not in self.texts:
                raise ValueError(f"no texts in '{known[slug].base}', the base language of edition '{slug}'")
        tracks = {t.slug for e in self.editions for t in known[e].tracks}
        if missing := set(self.tracks) - tracks:
            raise ValueError(f"tracks {sorted(missing)} are not tracks of {self.editions}")
        if self.status == "live" and not self.prices:
            raise ValueError("a live product needs a price")
        if self.kind == "membership":
            if not self.free:
                raise ValueError("kind membership needs `free`: what learners get without it")
            # Nobody may meet the limits without being offered the way past them.
            missing = [e.slug for e in known.values() if e.target in self.targets() and e.slug not in self.editions]
            if missing:
                raise ValueError(f"a membership covers whole target languages: add editions {missing}")
        if self.status == "live" and self.kind not in BUILT:
            raise ValueError(f"kind '{self.kind}' is not built yet: it can be draft or coming, not live")
        if self.kind == "stories" and not self.tags:
            raise ValueError("kind stories needs tags: the stories that belong to it")
        return self

    def targets(self) -> set[str]:
        known = editions.all_editions()
        return {known[e].target for e in self.editions}


@cache
def all_products() -> dict[str, Product]:
    products = {}
    for path in sorted(PRODUCTS.glob("*.yaml")):
        try:
            product = Product.model_validate(yamlio.load(path))
        except SystemExit:
            raise
        except Exception as e:
            raise SystemExit(f"{path.relative_to(ROOT)}: {e}")
        if product.slug != path.stem:
            raise SystemExit(f"{path.relative_to(ROOT)}: slug '{product.slug}' must match the file name")
        products[product.slug] = product
    # One membership per target language: it decides what is free there.
    members: dict[str, str] = {}
    for p in products.values():
        if p.kind == "membership":
            for target in p.targets():
                if target in members:
                    raise SystemExit(f"memberships '{members[target]}' and '{p.slug}' both cover '{target}'")
                members[target] = p.slug
    # A story belongs to at most one product.
    seen: dict[tuple[str, str], str] = {}
    for p in products.values():
        for target in p.targets():
            for tag in p.tags:
                if (target, tag) in seen:
                    raise SystemExit(f"products '{seen[target, tag]}' and '{p.slug}' both claim '{tag}' stories in '{target}'")
                seen[target, tag] = p.slug
    return products


def membership(target: str) -> Product | None:
    """The membership (Plus) of a target language, if it has one: then the free limits apply there."""
    return next((p for p in all_products().values() if p.kind == "membership" and target in p.targets()), None)


def web_json() -> str:
    data = {slug: p.model_dump() for slug, p in all_products().items()}
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_web() -> bool:
    """Write web/lib/products.json; True when it changed."""
    text = web_json()
    if WEB_FILE.exists() and WEB_FILE.read_text(encoding="utf-8") == text:
        return False
    WEB_FILE.write_text(text, encoding="utf-8", newline="\n")
    return True
