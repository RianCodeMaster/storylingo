"""Fourth LLM pass: everything a learner reads in their own language, for one story and one base language.

The story, its images and its audio are made once per target language. This pass is the cheap layer around it:
a translation per scene, the meaning of every tappable word, the meaning of the target structures with a short
explanation that suits this base language, the gestures and the summary. Run it again for every new base language.
"""
import json

from pydantic import ValidationError

from llm import MODEL, client
from models import Brief, Localization, SceneLocalization, Story, TargetMeaning
from prompts import LANGUAGE_NAMES

LOCALIZE_VERSION = "localize-v2"
REPAIR_ROUNDS = 2

SYSTEM = """You prepare a short story in a foreign language for language learners who speak another language.
Write everything in the learner's language, simple and natural, as a friendly teacher would.

Return ONLY JSON with this shape:
{
  "summary": "the story in one sentence",
  "gestures": {"<concept>": "how to act out the gesture, one sentence"},
  "targets": {"<target text>": {"gloss": "its meaning, 1 to 4 words",
                                "note": "one short grammar tip that compares with the learner's language, or null"}},
  "scenes": [{"position": 1, "translation": "the scene's meaning, natural, not word for word",
              "glosses": {"<word exactly as listed>": "meaning in this sentence, 1 to 4 words"}}],
  "words": {"<core word exactly as listed>": "its general meaning, with article for nouns, 1 to 4 words"}
}
Give every gesture, every target, every listed word and every core word a meaning. Keep the keys exactly as given.
If the input holds only some parts of the story, return only those parts (a scene with "translation_needed": false
needs only its glosses)."""

WORDS_SYSTEM = """Give the general meaning of each word for a language learner, in the learner's language:
1 to 4 words, nouns with their article. Return ONLY JSON: {"words": {"<word exactly as given>": "meaning"}}"""


def localize(brief: Brief, story: Story, base: str) -> tuple[Localization, dict]:
    """
    Make the base-language layer of one story. Returns it with usage stats.

    A model sometimes forgets a word or a tip. Whatever is missing after the first answer is asked again on its own
    (at most REPAIR_ROUNDS times), so a layer is complete instead of silently full of holes.
    """
    if base == brief.language:
        raise SystemExit(f"'{base}' is the story's own language.")
    loc = Localization(
        summary="", gestures={}, targets={}, words={},
        scenes=[SceneLocalization(translation="", glosses={}) for _ in story.scenes],
    )
    payload = {
        "story_language": LANGUAGE_NAMES.get(brief.language, brief.language),
        "learner_language": LANGUAGE_NAMES.get(base, base),
        "level": brief.level,
        "summary": story.summary,
        "gestures": {g.concept: g.description for g in story.gestures},
        "targets": [{"text": t.text, "hint": t.gloss} for t in brief.targets],
        "scenes": [
            {"position": i, "text": s.text, "words": [e.word for e in s.glossary]}
            for i, s in enumerate(story.scenes, 1)
        ],
        "core_words": [w.lemma for w in story.core_words],
    }
    tokens_in = tokens_out = 0
    for round_ in range(1 + REPAIR_ROUNDS):
        response = client().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        tokens_in += response.usage.prompt_tokens
        tokens_out += response.usage.completion_tokens
        _merge(loc, json.loads(response.choices[0].message.content), brief, story)
        gap = gaps(brief, story, loc)
        if not gap:
            break
        print(f"  localize {base}: {count(gap)} missing, asking again")
        payload = _repair_payload(payload, gap, story)

    gap = gaps(brief, story, loc)
    print(f"  localize {base}: {sum(len(s.glosses) for s in loc.scenes)} words, {count(gap)} missing"
          + (f" -> {json.dumps(gap, ensure_ascii=False)}" if gap else ""))
    return loc, {
        f"localize_{base}_version": LOCALIZE_VERSION,
        f"localize_{base}_input_tokens": tokens_in,
        f"localize_{base}_output_tokens": tokens_out,
    }


def _merge(loc: Localization, data: dict, brief: Brief, story: Story) -> None:
    """Take what fits from one answer into the layer; never overwrite what an earlier answer already gave."""
    loc.summary = loc.summary or str(data.get("summary") or "")
    given = data.get("gestures") or {}
    for g in story.gestures:
        if not loc.gestures.get(g.concept) and given.get(g.concept):
            loc.gestures[g.concept] = str(given[g.concept])
    given = data.get("targets") or {}
    for t in brief.targets:
        if t.text not in loc.targets:
            try:
                loc.targets[t.text] = TargetMeaning.model_validate(given.get(t.text))
            except ValidationError:
                pass
    by_position = {s.get("position"): s for s in data.get("scenes") or [] if isinstance(s, dict)}
    for i, (scene, scene_loc) in enumerate(zip(story.scenes, loc.scenes), 1):
        got = by_position.get(i, {})
        scene_loc.translation = scene_loc.translation or str(got.get("translation") or "")
        words = {e.word for e in scene.glossary}
        for word, gloss in (got.get("glosses") or {}).items():
            if word in words and gloss and word not in scene_loc.glosses:
                scene_loc.glosses[word] = str(gloss)
    loc.words = {**_known(data, story), **loc.words}


def gaps(brief: Brief, story: Story, loc: Localization | None) -> dict:
    """What a learner with this base language would not be able to read. Empty when the layer is complete."""
    if loc is None:
        return {"layer": "missing"}
    gap: dict = {}
    if not loc.summary:
        gap["summary"] = True
    if missing := [g.concept for g in story.gestures if not loc.gestures.get(g.concept)]:
        gap["gestures"] = missing
    if missing := [t.text for t in brief.targets if t.text not in loc.targets or not loc.targets[t.text].gloss]:
        gap["targets"] = missing
    if missing := [w.lemma for w in story.core_words if not loc.words.get(w.lemma)]:
        gap["core_words"] = missing
    scenes = {}
    for i, scene in enumerate(story.scenes, 1):
        scene_loc = loc.scenes[i - 1] if i <= len(loc.scenes) else None
        hole = {}
        if not scene_loc or not scene_loc.translation:
            hole["translation"] = True
        if words := [e.word for e in scene.glossary if not scene_loc or not scene_loc.glosses.get(e.word)]:
            hole["words"] = words
        if hole:
            scenes[i] = hole
    if scenes:
        gap["scenes"] = scenes
    return gap


def count(gap: dict) -> int:
    """How many separate texts are missing."""
    n = sum(len(gap.get(k, [])) for k in ("gestures", "targets", "core_words")) + int("summary" in gap) + int("layer" in gap)
    return n + sum(int("translation" in s) + len(s.get("words", [])) for s in gap.get("scenes", {}).values())


def _repair_payload(full: dict, gap: dict, story: Story) -> dict:
    """The same request, cut down to what is still missing (scene texts stay as context for the word meanings)."""
    payload = {k: full[k] for k in ("story_language", "learner_language", "level")}
    if gap.get("summary"):
        payload["summary"] = full["summary"]
    if "gestures" in gap:
        payload["gestures"] = {c: full["gestures"][c] for c in gap["gestures"]}
    if "targets" in gap:
        payload["targets"] = [t for t in full["targets"] if t["text"] in gap["targets"]]
    if "core_words" in gap:
        payload["core_words"] = gap["core_words"]
    if "scenes" in gap:
        payload["scenes"] = [
            {"position": i, "text": story.scenes[i - 1].text, "words": hole.get("words", []),
             "translation_needed": bool(hole.get("translation"))}
            for i, hole in gap["scenes"].items()
        ]
    return payload


def localize_words(brief: Brief, story: Story, base: str) -> tuple[dict[str, str], dict]:
    """Only the meanings of the core words, for a layer that already exists. Leaves checked translations alone."""
    response = client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": WORDS_SYSTEM},
            {"role": "user", "content": json.dumps({
                "word_language": LANGUAGE_NAMES.get(brief.language, brief.language),
                "learner_language": LANGUAGE_NAMES.get(base, base),
                "words": [w.lemma for w in story.core_words],
            }, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    words = _known(json.loads(response.choices[0].message.content), story)
    print(f"  word meanings {base}: {len(words)} of {len(story.core_words)}")
    return words, {f"localize_words_{base}_output_tokens": response.usage.completion_tokens}


def _known(data: dict, story: Story) -> dict[str, str]:
    """The meanings the model gave for the story's core words, nothing else."""
    given = data.get("words") or {}
    return {w.lemma: str(given[w.lemma]) for w in story.core_words if given.get(w.lemma)}
