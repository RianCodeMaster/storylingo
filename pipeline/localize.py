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

LOCALIZE_VERSION = "localize-v1"

SYSTEM = """You prepare a short story in a foreign language for language learners who speak another language.
Write everything in the learner's language, simple and natural, as a friendly teacher would.

Return ONLY JSON with this shape:
{
  "summary": "the story in one sentence",
  "gestures": {"<concept>": "how to act out the gesture, one sentence"},
  "targets": {"<target text>": {"gloss": "its meaning, 1 to 4 words",
                                "note": "one short grammar tip that compares with the learner's language, or null"}},
  "scenes": [{"position": 1, "translation": "the scene's meaning, natural, not word for word",
              "glosses": {"<word exactly as listed>": "meaning in this sentence, 1 to 4 words"}}]
}
Give every gesture, every target and every listed word a meaning. Keep the keys exactly as given."""


def localize(brief: Brief, story: Story, base: str) -> tuple[Localization, dict]:
    """Make the base-language layer of one story. Returns it with usage stats."""
    if base == brief.language:
        raise SystemExit(f"'{base}' is the story's own language.")
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

    # Take what fits and report what is missing, instead of failing on one forgotten word.
    by_position = {s.get("position"): s for s in data.get("scenes", [])}
    missing = 0
    scenes = []
    for i, scene in enumerate(story.scenes, 1):
        got = by_position.get(i, {})
        glosses = {w: str(g) for w, g in (got.get("glosses") or {}).items() if w in {e.word for e in scene.glossary}}
        missing += len(scene.glossary) - len(glosses)
        scenes.append(SceneLocalization(translation=got.get("translation") or "", glosses=glosses))
    targets = {}
    for t in brief.targets:
        try:
            targets[t.text] = TargetMeaning.model_validate((data.get("targets") or {}).get(t.text))
        except ValidationError:
            missing += 1
    gestures = {g.concept: str((data.get("gestures") or {}).get(g.concept, "")) for g in story.gestures}
    missing += sum(1 for d in gestures.values() if not d) + sum(1 for s in scenes if not s.translation)

    print(f"  localize {base}: {sum(len(s.glosses) for s in scenes)} words, {missing} missing")
    localization = Localization(summary=data.get("summary") or "", gestures=gestures, targets=targets, scenes=scenes)
    return localization, {
        f"localize_{base}_version": LOCALIZE_VERSION,
        f"localize_{base}_input_tokens": response.usage.prompt_tokens,
        f"localize_{base}_output_tokens": response.usage.completion_tokens,
    }
