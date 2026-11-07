"""What a generated file or translation was made from, as a short hash.

Every recording, picture and scene translation remembers the fingerprint of its source. When the source changes
(a question reworded, a scene rewritten, another voice in the language file), the fingerprint no longer matches
and `media` or `localize` makes that one item again. Nothing else is touched.
"""
import hashlib
import json

from models import Scene, Story


def _hash(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def narration(scene: Scene, voice: dict) -> str:
    """A scene's audio: its sentences with their emotions, spoken by this voice."""
    return _hash("narration", scene.text, [line.model_dump() for line in scene.voice], voice)


def spoken(text: str, kind: str, voice: dict) -> str:
    """A question or a single word, spoken by this voice."""
    return _hash(kind, text, voice)


def picture(prompt: str) -> str:
    """A scene image or a core-word picture. The provider is a choice per run, not part of the source."""
    return _hash("picture", prompt)


def scene_source(scene: Scene) -> str:
    """What a scene translation is made from: the text and the tappable words."""
    return _hash("scene", scene.text, [e.word for e in scene.glossary])


def summary_source(story: Story) -> str:
    return _hash("summary", story.summary)
