"""Is a base language complete? Everything a learner reads in their own language, checked in one go.

    python storylingo.py check <base>

1. The app texts: web/dictionaries/<base>.json has every key of nl.json, nothing empty, the same {placeholders},
   and every plural form that language needs (Arabic has six).
2. The app knows the language: lib/locales.ts and app/[lang]/dictionaries.ts.
3. Every story file (pipeline/stories) of a target language this base is paired with has a complete layer.
4. The database: the language is a base language, has pairs, and every published story has its texts there.
"""
import json
import re
from pathlib import Path

import db
from localize import count, gaps

WEB = Path(__file__).parent.parent / "web"
REFERENCE = "nl"
PLURAL_KEYS = {"zero", "one", "two", "few", "many", "other"}
# The forms Intl.PluralRules gives for each language (CLDR); the app picks one per number.
PLURAL_FORMS = {
    "nl": {"one", "other"}, "en": {"one", "other"}, "de": {"one", "other"}, "es": {"one", "many", "other"},
    "fr": {"one", "many", "other"}, "ar": {"zero", "one", "two", "few", "many", "other"},
}


def _texts(node, path=""):
    """Every text in a dictionary as {path: text}; plural objects as {path: {form: text}}."""
    if isinstance(node, dict) and node and set(node) <= PLURAL_KEYS:
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _texts(value, f"{path}.{key}" if path else key)
    else:
        yield path, node


def _placeholders(text: str) -> set[str]:
    return set(re.findall(r"\{(\w+)\}", text))


def dictionary_gaps(base: str) -> list[str]:
    path = WEB / "dictionaries" / f"{base}.json"
    if not path.exists():
        return [f"{path.relative_to(WEB.parent)} does not exist (copy {REFERENCE}.json and translate it)"]
    reference = dict(_texts(json.loads((WEB / "dictionaries" / f"{REFERENCE}.json").read_text(encoding="utf-8"))))
    texts = dict(_texts(json.loads(path.read_text(encoding="utf-8"))))
    problems = [f"missing text: {k}" for k in reference if k not in texts]
    problems += [f"text not in {REFERENCE}.json (old?): {k}" for k in texts if k not in reference]
    for key, text in texts.items():
        if key not in reference:
            continue
        wanted = _placeholders(json.dumps(reference[key], ensure_ascii=False))
        if isinstance(text, dict):
            forms = PLURAL_FORMS.get(base, {"other"})
            if missing := forms - set(text):
                problems.append(f"{key}: plural forms missing {sorted(missing)}")
            values = list(text.values())
        else:
            values = [text]
        for value in values:
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{key}: empty")
            elif not _placeholders(value) <= wanted or (len(values) == 1 and _placeholders(value) != wanted):
                problems.append(f"{key}: placeholders {sorted(_placeholders(value))}, expected {sorted(wanted)}")
    return problems


def app_gaps(base: str) -> list[str]:
    problems = []
    locales = (WEB / "lib" / "locales.ts").read_text(encoding="utf-8")
    if not re.search(rf'LOCALES = \[[^\]]*"{base}"', locales):
        problems.append(f'"{base}" not in LOCALES in web/lib/locales.ts')
    if not re.search(rf"LOCALE_NAMES[^\n]*\b{base}:", locales):
        problems.append(f"no name for '{base}' in LOCALE_NAMES in web/lib/locales.ts")
    if f"  {base}: () => import" not in (WEB / "app" / "[lang]" / "dictionaries.ts").read_text(encoding="utf-8"):
        problems.append(f"'{base}' not in web/app/[lang]/dictionaries.ts")
    return problems


def story_gaps(base: str, stories: dict) -> list[str]:
    """stories: slug -> (brief, story, localizations), for every story file whose language pairs with this base."""
    problems = []
    for slug, (brief, story, localizations) in stories.items():
        gap = gaps(brief, story, localizations.get(base))
        if gap:
            problems.append(f"{slug}: {count(gap)} missing -> {json.dumps(gap, ensure_ascii=False)[:300]}"
                            f"  (fix: storylingo.py localize {slug} {base})")
    return problems


def check(base: str, stories: dict) -> bool:
    """Print every problem per area; True when the base language is complete."""
    complete = True
    for area, problems in [
        ("app texts", dictionary_gaps(base)),
        ("app setup", app_gaps(base)),
        ("story files", story_gaps(base, stories)),
        ("database", db.base_gaps(base)),
    ]:
        print(f"{'✓' if not problems else '✗'} {area}" + (f": {len(problems)} problem(s)" if problems else ""))
        for p in problems:
            print(f"    {p}")
        complete = complete and not problems
    print(f"\n'{base}' is {'complete' if complete else 'NOT complete'}.")
    return complete
