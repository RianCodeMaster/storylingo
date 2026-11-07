"""What each level teaches, per target language: content/curriculum/<language>.yaml.

A story practises a few structures from its level (or below). `check` uses this to catch a B1 structure in an A1
story, and a structure whose concept differs from the curriculum (then one meaning would get two gestures).
"""
from functools import cache
from pathlib import Path

from pydantic import BaseModel

import yamlio
from models import Level, Target

ROOT = Path(__file__).parent.parent
CURRICULA = ROOT / "content" / "curriculum"
LEVELS: list[str] = ["A1", "A2", "B1", "B2", "C1", "C2"]


class Entry(BaseModel):
    level: Level
    target: Target


@cache
def curriculum(language: str) -> dict[str, Entry] | None:
    """Every structure of a language by its text, or None when the language has no curriculum yet."""
    path = CURRICULA / f"{language}.yaml"
    if not path.exists():
        return None
    try:
        data = yamlio.load(path)
        return {t["text"]: Entry(level=level, target=Target.model_validate(t))
                for level, targets in data.items() for t in targets}
    except Exception as e:
        raise SystemExit(f"{path.relative_to(ROOT)}: {e}")


def above(level: str, story_level: str) -> bool:
    return LEVELS.index(level) > LEVELS.index(story_level)
