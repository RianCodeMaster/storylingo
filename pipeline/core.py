"""LLM pass after the glossary: the few words that carry the plot, each with a picture to draw.

They are taught before the story (picture + voice + meaning), practised in a listening game and then reviewed,
so a learner leaves every story with a handful of solid new words on top of the target structures.
"""
import json

from llm import MODEL, client
from models import Brief, CoreWord, Story
from languages import english

CORE_VERSION = "core-v1"
CORE_WORDS = 6

SYSTEM = f"""You choose the core words of a short story for language learners: the {CORE_WORDS} words a learner
must know to follow the plot, taught with a picture before reading.

Rules:
- Pick from the given lemmas only, copied exactly. Never a target structure, a name or a number.
- Prefer concrete, picturable words (things, animals, places, actions) that matter for the story.
- Prefer words around the learner's level or just above it; skip the most basic words (und, ist, sein, haben, ich).
- For each word, an "image_prompt": an English description of ONE simple picture that shows the word,
  e.g. "a small hamster cage" or "a person running fast". No text in the picture.

Return ONLY JSON: {{"words": [{{"lemma": "...", "image_prompt": "..."}}]}} with exactly {CORE_WORDS} words."""


def add_core_words(brief: Brief, story: Story) -> dict:
    """Fill story.core_words in place. Returns usage stats."""
    lemmas = {e.lemma: e.level for s in story.scenes for e in s.glossary}
    targets = {t.text.lower() for t in brief.targets}
    payload = {
        "language": english(brief.language),
        "level": brief.level,
        "targets": [t.text for t in brief.targets],
        "story": " ".join(s.text for s in story.scenes),
        "lemmas": [{"lemma": lemma, "level": level} for lemma, level in lemmas.items()],
    }
    response = client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    data = json.loads(response.choices[0].message.content)

    # Keep what is valid: a known lemma, not a target, once each.
    words, seen = [], set()
    for w in data.get("words", []):
        lemma, prompt = w.get("lemma"), w.get("image_prompt")
        if lemma in lemmas and lemma not in seen and lemma.lower() not in targets and prompt:
            seen.add(lemma)
            words.append(CoreWord(lemma=lemma, image_prompt=prompt))
    story.core_words = words[:CORE_WORDS]
    print("  core words: " + ", ".join(w.lemma for w in story.core_words))
    return {
        "core_version": CORE_VERSION,
        "core_input_tokens": response.usage.prompt_tokens,
        "core_output_tokens": response.usage.completion_tokens,
    }
