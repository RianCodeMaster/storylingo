"""The shapes that flow through the pipeline: a brief goes in, a story comes out.

A story is written in its target language and is the same for every learner. What a learner reads in their
own (base) language lives in a Localization, one per base language, made afterwards (localize.py).
"""
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Level = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class Target(BaseModel):
    """A structure the story must practise, as written in the brief."""
    text: str                      # 'wollte'
    gloss: str | None = None       # hint for the story writer, any language ('wanted'); learners see Localization.targets
    concept: str | None = None     # language-neutral key, e.g. 'want'; None for pure grammar
    kind: Literal["word", "phrase", "structure"] = "word"


class Brief(BaseModel):
    slug: str
    language: str = "de"           # the target language
    level: Level = "A2"
    theme: str
    scenes: int = Field(5, ge=3, le=8)
    targets: list[Target] = Field(min_length=1, max_length=4)


class Gesture(BaseModel):
    concept: str
    description: str               # how to act it out, in English: the source for every Localization
    emoji: str


class Question(BaseModel):
    kind: Literal["yes_no", "either_or", "who_what", "open"]
    prompt: str
    options: list[str] = Field(min_length=2, max_length=4)
    answer: str
    target: str | None = None      # target text this question circles

    @model_validator(mode="after")
    def answer_is_an_option(self):
        if self.answer not in self.options:
            raise ValueError(f"answer {self.answer!r} is not one of the options {self.options}")
        return self


class GlossEntry(BaseModel):
    """One tappable word in a scene."""
    word: str                      # exactly as written in the scene, e.g. 'Käfig'
    lemma: str                     # dictionary form, nouns with article: 'der Käfig'
    level: Level = "A2"


Emotion = Literal["amused", "angry", "disgusted", "neutral", "sleepy", "surprised", "whisper"]


class VoiceLine(BaseModel):
    """One sentence and the emotion it is spoken with."""
    text: str
    emotion: Emotion = "neutral"


class Scene(BaseModel):
    text: str
    image_prompt: str
    questions: list[Question] = Field(min_length=2)
    glossary: list[GlossEntry] = []
    voice: list[VoiceLine] = []


class CoreWord(BaseModel):
    """One of the few words that carry the plot, taught with a picture before the story."""
    lemma: str                     # dictionary form, as in a scene glossary: 'der Käfig'
    image_prompt: str              # English: one simple picture of the word


class Story(BaseModel):
    title: str                     # in the target language
    summary: str                   # in English: the source for every Localization
    gestures: list[Gesture]
    scenes: list[Scene]
    core_words: list[CoreWord] = []


class TargetMeaning(BaseModel):
    gloss: str                     # 'hoewel'
    note: str | None = None        # 'verb at the end, just like in Dutch'


class SceneLocalization(BaseModel):
    translation: str
    glosses: dict[str, str] = {}   # word as written in the scene -> meaning in this sentence


class Localization(BaseModel):
    """Everything a learner reads in their own language, for one story and one base language."""
    summary: str
    gestures: dict[str, str]       # concept -> how to act it out
    targets: dict[str, TargetMeaning]  # target text -> meaning
    scenes: list[SceneLocalization]
    words: dict[str, str] = {}     # core word lemma -> its general meaning ('der Käfig' -> 'de kooi')


def occurs(text: str, phrase: str) -> int:
    """How often a word or phrase appears in a text as a whole word, ignoring case."""
    pattern = re.compile(r"(?<!\w)" + re.escape(phrase.lower()) + r"(?!\w)")
    return len(pattern.findall(text.lower()))


def count_occurrences(story: Story, target: str) -> int:
    """How often a target appears in the story text."""
    return sum(occurs(scene.text, target) for scene in story.scenes)


def check_story(brief: Brief, story: Story, min_repeats: int = 3) -> list[str]:
    """Problems the LLM must fix. Empty list means the story is usable."""
    problems = []
    if len(story.scenes) != brief.scenes:
        problems.append(f"Expected {brief.scenes} scenes, got {len(story.scenes)}.")
    for target in brief.targets:
        n = count_occurrences(story, target.text)
        if n < min_repeats:
            problems.append(f"Target '{target.text}' appears {n}x in the scene texts, needs at least {min_repeats}x.")
    known = {t.text for t in brief.targets}
    for i, scene in enumerate(story.scenes, 1):
        for q in scene.questions:
            if q.target is not None and q.target not in known:
                problems.append(f"Scene {i}: question target '{q.target}' is not one of {sorted(known)}.")
    wanted = {t.concept for t in brief.targets if t.concept}
    given = {g.concept for g in story.gestures}
    if missing := wanted - given:
        problems.append(f"Missing gestures for concepts: {sorted(missing)}.")
    return problems
