"""The phrases section: the most useful chunks of a language, per level, learned apart from the stories.

    content/phrases/<language>/<level>.yaml   the phrases of one level, in learning order (with an English hint)
    content/phrases/<language>/<base>.yaml    their meanings for learners with that base language

Every edition with that target language shows the same phrases. In the database a phrase is a lexeme of kind
'phrase' (so it gets audio, meanings and spaced repetition like any word) plus a row in `phrases` for its level and
place. DeepSeek drafts them (`phrases <language> <level>`), a person checks them, `localize-phrases` translates.
"""
import json
from pathlib import Path

from pydantic import BaseModel, Field

import yamlio
from languages import english
from llm import MODEL, client

ROOT = Path(__file__).parent.parent
PHRASES = ROOT / "content" / "phrases"
PER_LEVEL = 200
LEVELS = ("A1", "A2", "B1")

HEADER = """\
# Phrases for the phrases section, in learning order: the most useful first. Every edition with this target language
# shows them. Edit freely (a changed text is a new phrase: it needs a meaning again, `localize-phrases` adds it),
# then: storylingo.py sync. hint: English, for the translator and for you; learners never see it.
"""
MEANINGS_HEADER = """\
# What each phrase means for learners with this base language. Made by `storylingo.py localize-phrases`; corrections
# by hand are welcome (then: storylingo.py sync).
"""


class Phrase(BaseModel):
    text: str = Field(min_length=1)
    hint: str | None = None        # English: when you say it, for the translator


def path(language: str, level: str) -> Path:
    return PHRASES / language / f"{level}.yaml"


def read(language: str, level: str) -> list[Phrase]:
    p = path(language, level)
    if not p.exists():
        return []
    try:
        return [Phrase.model_validate(x) for x in (yamlio.load(p) or [])]
    except Exception as e:
        raise SystemExit(f"{p.relative_to(ROOT)}: {e}")


def write(language: str, level: str, phrases: list[Phrase]) -> None:
    yamlio.save(path(language, level), [p.model_dump(exclude_none=True) for p in phrases], HEADER)


def all_sets(language: str) -> dict[str, list[Phrase]]:
    return {level: read(language, level) for level in LEVELS if path(language, level).exists()}


def languages_with_phrases() -> list[str]:
    return sorted(p.name for p in PHRASES.iterdir() if p.is_dir()) if PHRASES.exists() else []


def meanings(language: str, base: str) -> dict[str, str]:
    p = PHRASES / language / f"{base}.yaml"
    return dict(yamlio.load(p) or {}) if p.exists() else {}


def write_meanings(language: str, base: str, found: dict[str, str]) -> None:
    yamlio.save(PHRASES / language / f"{base}.yaml", found, MEANINGS_HEADER)


def _key(text: str) -> str:
    return " ".join(text.lower().strip(" .!?¡¿").split())


# German questions start with a question word or with the verb.
GERMAN_QUESTION_START = {
    "wie", "was", "wo", "wohin", "woher", "wann", "warum", "wer", "wen", "wem", "welche", "welcher", "welches",
    "wieso", "weshalb", "kann", "kannst", "können", "könnten", "könntest", "darf", "dürfen", "ist", "sind", "bist",
    "hast", "haben", "hat", "gibt", "möchten", "möchtest", "soll", "sollen", "wollen", "willst", "kommst", "fährt",
    "geht", "gehst", "hätten", "würden", "würdest", "machst", "brauchst", "brauche", "muss", "musst", "habt", "seid",
}


def tidy(language: str, phrase: Phrase) -> Phrase:
    """
    One written form for every phrase, whatever the batch it came from: a capital first letter (after ¿ or ¡ in
    Spanish) and a closing mark. A question (the hint asks, or a German question word or verb comes first) gets a
    question mark, and in Spanish an opening ¿; a hint with ! gives !, anything else a full stop.
    """
    text = phrase.text.strip()
    hint = (phrase.hint or "").strip()
    lead = len(text) - len(text.lstrip("¿¡"))
    text = text[:lead] + text[lead:lead + 1].upper() + text[lead + 1:]
    if text[-1] not in ".?!…":
        first = text.lstrip("¿¡").split()[0].lower().strip(",")
        question = hint.endswith("?") or text.startswith("¿") or (language == "de" and first in GERMAN_QUESTION_START)
        if question:
            text = ("¿" + text if language == "es" and not text.startswith("¿") else text) + "?"
        else:
            text += "!" if hint.endswith("!") or text.startswith("¡") else "."
    return Phrase(text=text, hint=phrase.hint)


# Which variety a learner meets: the one of the editions that teach the language.
VARIANTS = {"es": " (as spoken in Spain)", "nl": " (as spoken in the Netherlands)"}

GENERATE = """You are an experienced teacher of {language} for adults. List the most useful chunks a learner at CEFR
{level} needs in daily life: short phrases and fixed expressions people really say (greetings, requests, reactions,
questions, everyday situations: shops, work, doctor, offices, transport, home, feelings), not single words.
Rules: natural and correct {language}{variant}; at most 8 words; each one different in meaning; ordered from most to
least useful; exactly {level}, not easier and not harder. Do not repeat any phrase from the "known" list.
Return ONLY JSON: {{"phrases": [{{"text": "...", "hint": "English meaning or when you say it, max 8 words"}}]}}"""


def generate(language: str, level: str, count: int = PER_LEVEL) -> int:
    """Add phrases to a level until it has `count`. Never repeats a phrase of any level. Returns how many it added."""
    if level not in LEVELS:
        raise SystemExit(f"Phrases have levels {', '.join(LEVELS)}.")
    phrases = read(language, level)
    known = {_key(p.text) for lvl in LEVELS for p in read(language, lvl)}
    added, tries = 0, 0
    while len(phrases) < count and tries < 12:
        tries += 1
        want = min(50, count - len(phrases))
        response = client().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": GENERATE.format(
                    language=english(language), level=level,
                    variant=VARIANTS.get(language, ""))},
                {"role": "user", "content": json.dumps(
                    {"how_many": want, "known": sorted(known)}, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        for item in json.loads(response.choices[0].message.content).get("phrases", []):
            try:
                phrase = tidy(language, Phrase.model_validate(item))
            except Exception:
                continue
            k = _key(phrase.text)
            if k in known or len(phrase.text.split()) > 8 or len(phrases) >= count:
                continue
            known.add(k)
            phrases.append(phrase)
            added += 1
        write(language, level, phrases)
        print(f"  {language} {level}: {len(phrases)} of {count}")
    return added


TRANSLATE = """Translate each phrase for a language learner into {learner}: the natural way to say the same thing in
{learner}, not word for word. Use the hint for the meaning. Return ONLY JSON: {{"meanings": {{"<phrase exactly as
given>": "translation"}}}}"""


def localize(language: str, base: str) -> int:
    """Give every phrase without a meaning in this base language one (asks again for what the model skipped)."""
    found = meanings(language, base)
    every = [p for phrases in all_sets(language).values() for p in phrases]
    # Meanings of phrases that are gone stay out of the file.
    found = {p.text: found[p.text] for p in every if found.get(p.text)}
    for _ in range(3):
        todo = [p for p in every if p.text not in found]
        if not todo:
            break
        for start in range(0, len(todo), 80):
            batch = todo[start:start + 80]
            response = client().chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": TRANSLATE.format(learner=english(base))},
                    {"role": "user", "content": json.dumps(
                        {"phrase_language": english(language),
                         "phrases": [{"text": p.text, "hint": p.hint} for p in batch]}, ensure_ascii=False)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            given = json.loads(response.choices[0].message.content).get("meanings", {})
            found.update({p.text: str(given[p.text]) for p in batch if given.get(p.text)})
            write_meanings(language, base, {p.text: found[p.text] for p in every if p.text in found})
    missing = sum(1 for p in every if p.text not in found)
    print(f"  phrases {language} -> {base}: {len(every) - missing} of {len(every)}" + (f", {missing} missing" if missing else ""))
    return missing


def gaps(language: str, bases: list[str]) -> list[str]:
    """What the phrases section of a language still lacks: full levels, meanings per base language."""
    problems = []
    sets = all_sets(language)
    for level in LEVELS:
        n = len(sets.get(level, []))
        if n < PER_LEVEL:
            problems.append(f"{language} {level}: {n} of {PER_LEVEL} phrases (fix: storylingo.py phrases {language} {level})")
    seen: dict[str, str] = {}
    for level, phrases in sets.items():
        for p in phrases:
            if (k := _key(p.text)) in seen:
                problems.append(f"{language}: '{p.text}' is in {seen[k]} and {level}")
            seen[k] = level
    every = [p.text for phrases in sets.values() for p in phrases]
    for base in bases:
        found = meanings(language, base)
        missing = [t for t in every if not found.get(t)]
        if missing:
            problems.append(f"{language} -> {base}: {len(missing)} phrases without a meaning "
                            f"(fix: storylingo.py localize-phrases {language} {base})")
    return problems
