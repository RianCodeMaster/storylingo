"""Second LLM pass: every tappable word in every scene with its dictionary form. Meanings come from localize.py."""
import json

from pydantic import TypeAdapter, ValidationError

from llm import MODEL, client
from models import Brief, GlossEntry, Story, occurs
from prompts import LANGUAGE_NAMES

GLOSSARY_VERSION = "glossary-v2"  # v2: no meanings; those are per base language (localize.py)

SYSTEM = """You make a learner's dictionary for a short story.
For every scene, list every word in the scene text a learner could tap: nouns, verbs, adjectives, adverbs,
prepositions, conjunctions and pronouns. Skip names and numbers. Each different form gets its own entry.

Per entry:
- "word": the word exactly as written in the scene (same spelling and capitals).
- "lemma": the dictionary form. Nouns with their article (der/die/das), verbs as infinitive.
- "level": the CEFR level of the lemma (A1, A2, B1, B2, C1, C2).

Return ONLY JSON: {"scenes": [{"position": 1, "words": [{"word": "...", "lemma": "...", "level": "A1"}]}]}"""

_entries = TypeAdapter(list[GlossEntry])


def add_glossary(brief: Brief, story: Story) -> dict:
    """Fill scene.glossary for every scene in place. Returns usage stats."""
    scenes = [{"position": i, "text": s.text} for i, s in enumerate(story.scenes, 1)]
    response = client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": (
                f"Story language: {LANGUAGE_NAMES.get(brief.language, brief.language)}\n"
                f"Scenes: {json.dumps(scenes, ensure_ascii=False)}"
            )},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    data = json.loads(response.choices[0].message.content)
    by_position = {s.get("position"): s.get("words", []) for s in data.get("scenes", [])}

    dropped = 0
    for position, scene in enumerate(story.scenes, 1):
        try:
            entries = _entries.validate_python(by_position.get(position, []))
        except ValidationError:
            entries = []
        # Keep only words that really occur in the scene, once each.
        seen, kept = set(), []
        for e in entries:
            key = e.word.lower()
            if key in seen or not occurs(scene.text, e.word):
                dropped += 1
                continue
            seen.add(key)
            kept.append(e)
        scene.glossary = kept

    words = sum(len(s.glossary) for s in story.scenes)
    print(f"  glossary: {words} words, {dropped} dropped")
    return {
        "glossary_version": GLOSSARY_VERSION,
        "glossary_input_tokens": response.usage.prompt_tokens,
        "glossary_output_tokens": response.usage.completion_tokens,
    }
