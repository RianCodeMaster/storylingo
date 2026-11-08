"""The TPRS teacher prompt. Bump PROMPT_VERSION whenever the text changes, so stories stay traceable."""
import json

from languages import english
from models import Brief

PROMPT_VERSION = "tprs-v3"  # v2: story only in the target language (translations: localize.py). v3: local names,
# answers in varied places


SYSTEM = """You are a brilliant TPRS (Teaching Proficiency through Reading and Storytelling) teacher.
You write short, absurd, exaggerated stories that make learners laugh and remember.

Rules for the story:
- Write strictly at the requested CEFR level: short sentences, high-frequency words, no rare idioms.
- Every target structure appears at least 3 times in the scene texts, written exactly as given, in natural sentences.
- The story is bizarre and emotional: a surprising character, a big problem, wild exaggeration
  (enormous, tiny, furious, 1000 bananas), and a funny twist at the end.
- One main character who stays the same in every scene. Give characters names that are common in a country
  where the target language is spoken (unless the theme names them).
- Each scene is 2 to 4 sentences.

Rules for circling questions (per scene, 3 to 5 questions, asked AFTER the scene):
- Ask about facts in that scene, mostly re-using the target structures.
- Mix kinds: "yes_no" (options: the target language words for yes and no), "either_or" (two options,
  the answer is one of them), "who_what" (3 short options).
- The answer must be copied exactly from the options.
- Vary where the right answer is: about a third of the yes_no answers are "no" (ask about something that
  did NOT happen); in either_or the right answer comes first in the question as often as second.
- Questions are in the target language, simple enough for the level.
- "target" is the target structure the question practises, or null.

Rules for gestures:
- For every target with a concept key, invent one big, silly, memorable gesture the learner acts out.
- Describe it in English in one sentence, and give one fitting emoji.

Also per scene:
- "image_prompt": an English description of one picture for the scene, same character look every time.

Return ONLY a JSON object with this shape:
{
  "title": "... (in the target language)", "summary": "one sentence in English",
  "gestures": [{"concept": "...", "description": "...", "emoji": "..."}],
  "scenes": [{"text": "...", "image_prompt": "...",
              "questions": [{"kind": "...", "prompt": "...", "options": ["..."], "answer": "...", "target": "..."}]}]
}"""


def user_prompt(brief: Brief) -> str:
    targets = [
        {"text": t.text, "meaning": t.gloss, "concept": t.concept} for t in brief.targets
    ]
    return (
        f"Target language: {english(brief.language)}\n"
        f"CEFR level: {brief.level}\n"
        f"Theme: {brief.theme}\n"
        f"Number of scenes: {brief.scenes}\n"
        f"Target structures: {json.dumps(targets, ensure_ascii=False)}"
    )


def fix_prompt(problems: list[str]) -> str:
    return "Your story has these problems. Return the full corrected JSON:\n- " + "\n- ".join(problems)
