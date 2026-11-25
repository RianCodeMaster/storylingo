"""The word trainer: the most useful words of a language, per level, learned as cards apart from the stories.

    content/words/<language>/<level>.yaml   the words of one level, most useful first, each with an example sentence
    content/words/<language>/<base>.yaml    their meanings (and the example's translation) for learners with that base

It works like the phrases section (phrases.py): every edition with that target language shows the same words. In the
database a word is a lexeme of kind 'word' (so it gets audio, meanings and spaced repetition like any word) plus a row
in `words` for its level and place. A word that is also a story's glossary word is the same lexeme ("der Hund" in a
story and in the list): what a learner practised in one counts in the other. DeepSeek drafts the list (`words
<language> <level>`), a person checks it, `localize-words` translates.
"""
import json
from pathlib import Path

from pydantic import BaseModel, Field

import yamlio
from languages import english
from llm import MODEL, client
from phrases import TOPICS, VARIANTS, Topic, topic_ranks

ROOT = Path(__file__).parent.parent
WORDS = ROOT / "content" / "words"
LEVELS = ("A1", "A2", "B1")
# How many words a level gets: roughly what the CEFR word lists of the big exam institutes ask, per level (not in all).
PER_LEVEL = {"A1": 500, "A2": 700, "B1": 1200}

HEADER = """\
# Words for the word trainer, most useful first. Every edition with this target language shows them. text: the
# dictionary form (German nouns with der/die/das, verbs as infinitive), exactly like the stories' glossary, so a
# word met in a story is the same word here. example: one short sentence at this level. hint: English, for the
# translator and for you; learners never see it. Edit freely (a changed text is a new word: it needs a meaning again,
# `localize-words` adds it), then: storylingo.py sync.
"""
MEANINGS_HEADER = """\
# What each word means for learners with this base language, and its example sentence translated. Made by
# `storylingo.py localize-words`; corrections by hand are welcome (then: storylingo.py sync).
"""


class Word(BaseModel):
    text: str = Field(min_length=1)
    example: str = Field(min_length=1)    # one short sentence with the word, at the word's level
    hint: str | None = None               # English meaning, for the translator
    topics: list[Topic] = []              # one or two of phrases.TOPICS, the first is the main one


class Meaning(BaseModel):
    meaning: str
    example: str | None = None            # the example sentence in the base language


def path(language: str, level: str) -> Path:
    return WORDS / language / f"{level}.yaml"


def read(language: str, level: str) -> list[Word]:
    p = path(language, level)
    if not p.exists():
        return []
    try:
        return [Word.model_validate(x) for x in (yamlio.load(p) or [])]
    except Exception as e:
        raise SystemExit(f"{p.relative_to(ROOT)}: {e}")


def write(language: str, level: str, words: list[Word]) -> None:
    yamlio.save(path(language, level), [w.model_dump(exclude_none=True) for w in words], HEADER)


def all_sets(language: str) -> dict[str, list[Word]]:
    return {level: read(language, level) for level in LEVELS if path(language, level).exists()}


def languages_with_words() -> list[str]:
    return sorted(p.name for p in WORDS.iterdir() if p.is_dir()) if WORDS.exists() else []


def meanings(language: str, base: str) -> dict[str, Meaning]:
    p = WORDS / language / f"{base}.yaml"
    return {k: Meaning.model_validate(v) for k, v in (yamlio.load(p) or {}).items()} if p.exists() else {}


def write_meanings(language: str, base: str, found: dict[str, Meaning]) -> None:
    yamlio.save(WORDS / language / f"{base}.yaml", {k: m.model_dump(exclude_none=True) for k, m in found.items()},
                MEANINGS_HEADER)


def _key(text: str) -> str:
    return " ".join(text.lower().split())


# Articles after which a German noun follows: the noun gets its capital ("der mund" -> "der Mund").
GERMAN_ARTICLES = {"der", "die", "das"}


def tidy(language: str, word: Word) -> Word:
    """One written form for every word, whatever batch it came from: no stray spaces or full stop, and in German a
    noun after its article with a capital, as in the stories' glossary."""
    text = " ".join(word.text.split()).rstrip(".")
    parts = text.split(" ")
    if language == "de" and len(parts) >= 2 and parts[0].lower() in GERMAN_ARTICLES:
        parts = [parts[0].lower(), parts[1][:1].upper() + parts[1][1:], *parts[2:]]
        text = " ".join(parts)
    return word.model_copy(update={"text": text})


# How the dictionary form is written: the same rule as the stories' glossary (glossary.py), so both meet.
FORMS = {
    "de": "nouns with their article (der Hund, die Stadt, das Haus), verbs as infinitive (gehen), adjectives plain",
    "nl": "nouns with their article (de hond, het huis), verbs as infinitive (lopen), adjectives plain",
    "es": "nouns with their article (el perro, la casa), verbs as infinitive (comer), adjectives in the masculine",
}

GENERATE = """You are an experienced teacher of {language} for adults. List the words a learner at CEFR {level} must
know, as in the official {level} word lists of the big exam institutes: the words of daily life (people, home, food,
shopping, work, health, offices, transport, time, feelings) and the small words that hold sentences together.
Rules: write each word in its dictionary form: {forms}. No names, no numbers above twelve. Each word once. Ordered from
most to least useful. Exactly {level}, not easier and not harder. Do not repeat any word from the "known" list.
For every word one short example sentence at {level} (at most 8 words) in natural {language}{variant}, and a topic.
Topics (use these keys only): health, work, office (authorities and paperwork), shopping (also food and eating out),
housing, travel (also transport), social (people, feelings), everyday (anything else).
Return ONLY JSON: {{"words": [{{"text": "...", "example": "...", "hint": "English meaning, 1-4 words",
"topics": ["everyday"]}}]}}"""


def generate(language: str, level: str, count: int | None = None) -> int:
    """Add words to a level until it has `count`. Never repeats a word of any level. Returns how many it added."""
    if level not in LEVELS:
        raise SystemExit(f"Words have levels {', '.join(LEVELS)}.")
    count = count or PER_LEVEL[level]
    words = read(language, level)
    known = {_key(w.text) for lvl in LEVELS for w in read(language, lvl)}
    added, tries = 0, 0
    while len(words) < count and tries < 30:
        tries += 1
        want = min(60, count - len(words))
        response = client().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": GENERATE.format(
                    language=english(language), level=level, forms=FORMS.get(language, "dictionary form"),
                    variant=VARIANTS.get(language, ""))},
                {"role": "user", "content": json.dumps({"how_many": want, "known": sorted(known)}, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.5,
        )
        for item in json.loads(response.choices[0].message.content).get("words", []):
            try:
                item["topics"] = [t for t in item.get("topics") or [] if t in TOPICS][:2]
                word = tidy(language, Word.model_validate(item))
            except Exception:
                continue
            k = _key(word.text)
            if k in known or len(word.text.split()) > 3 or len(words) >= count:
                continue
            known.add(k)
            words.append(word)
            added += 1
        write(language, level, words)
        print(f"  {language} {level}: {len(words)} of {count}")
    return added


TRANSLATE = """Give each word's meaning for a language learner in {learner}: the usual translation, short (1-4 words;
two meanings separated by a comma when the word has two common ones). Use the hint. Also translate its example
sentence naturally into {learner}. Return ONLY JSON: {{"meanings": {{"<word exactly as given>": {{"meaning": "...",
"example": "..."}}}}}}"""


def localize(language: str, base: str) -> int:
    """Give every word without a meaning in this base language one (asks again for what the model skipped)."""
    found = meanings(language, base)
    every = [w for words in all_sets(language).values() for w in words]
    # Meanings of words that are gone stay out of the file.
    found = {w.text: found[w.text] for w in every if w.text in found}
    for _ in range(3):
        todo = [w for w in every if w.text not in found]
        if not todo:
            break
        for start in range(0, len(todo), 60):
            batch = todo[start:start + 60]
            response = client().chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": TRANSLATE.format(learner=english(base))},
                    {"role": "user", "content": json.dumps(
                        {"word_language": english(language),
                         "words": [{"text": w.text, "hint": w.hint, "example": w.example} for w in batch]},
                        ensure_ascii=False)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            given = json.loads(response.choices[0].message.content).get("meanings", {})
            for w in batch:
                g = given.get(w.text)
                if isinstance(g, dict) and g.get("meaning"):
                    found[w.text] = Meaning(meaning=str(g["meaning"]), example=g.get("example") or None)
            write_meanings(language, base, {w.text: found[w.text] for w in every if w.text in found})
    missing = sum(1 for w in every if w.text not in found)
    print(f"  words {language} -> {base}: {len(every) - missing} of {len(every)}" + (f", {missing} missing" if missing else ""))
    return missing


def gaps(language: str, bases: list[str]) -> list[str]:
    """What the word trainer of a language still lacks: meanings per base language, words in two levels. A level
    with fewer words than PER_LEVEL is fine (a list may start small); a missing meaning is not."""
    problems = []
    sets = all_sets(language)
    seen: dict[str, str] = {}
    for level, words in sets.items():
        for w in words:
            if (k := _key(w.text)) in seen:
                problems.append(f"{language}: word '{w.text}' is in {seen[k]} and {level}")
            seen[k] = level
    every = [w.text for words in sets.values() for w in words]
    for base in bases:
        found = meanings(language, base)
        missing = [t for t in every if t not in found]
        if missing:
            problems.append(f"{language} -> {base}: {len(missing)} words without a meaning "
                            f"(fix: storylingo.py localize-words {language} {base})")
    return problems


__all__ = ["Word", "Meaning", "LEVELS", "PER_LEVEL", "read", "all_sets", "meanings", "generate", "localize", "gaps",
           "languages_with_words", "topic_ranks"]
