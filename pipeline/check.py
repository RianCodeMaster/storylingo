"""Is everything complete and in sync? One command, every area, and for each problem the command that fixes it.

    python storylingo.py check          everything
    python storylingo.py check <base>   only what learners with that base language need

1. Content files: every language and story file reads without errors; stories pass their own rules
   (each target at least 3x, core words are glossary words).
2. App setup: web/lib/languages.json matches the language files.
3. Base languages: web/dictionaries/<base>.json has every text of nl.json, nothing empty, the same {placeholders}
   and every plural form the language needs (Arabic has six).
4. Translations: every story has a complete, up-to-date layer for each base language it is offered in.
5. Database: matches the files (a dry run of sync), and has what the app reads for each base language.
6. Media: every picture and recording exists and matches its text and voice.
"""
import json
import re
from pathlib import Path

import content
import db
import editions
import languages
import phrases
from localize import count, gaps
from mediajobs import media_jobs, phrase_jobs
from curriculum import above, curriculum
from models import check_story

WEB = Path(__file__).parent.parent / "web"
REFERENCE = "nl"
PLURAL_KEYS = {"zero", "one", "two", "few", "many", "other"}


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
            forms = set(languages.get(base).plural_forms)  # the forms Intl.PluralRules gives this language
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
    if base not in languages.all_languages():
        return [f"no content/languages/{base}.yaml (copy nl.yaml)"]
    problems = []
    if not languages.get(base).is_base:
        problems.append(f"content/languages/{base}.yaml: roles has no 'base'")
    if not languages.WEB_FILE.exists() or languages.WEB_FILE.read_text(encoding="utf-8") != languages.web_json():
        problems.append("web/lib/languages.json is out of date (fix: storylingo.py sync)")
    return problems


def story_rules(doc) -> list[str]:
    problems = check_story(doc.brief, doc.story)
    lemmas = {e.lemma for scene in doc.story.scenes for e in scene.glossary}
    problems += [f"core word '{w.lemma}' is not a glossary word (fix: storylingo.py core {doc.slug})"
                 for w in doc.story.core_words if w.lemma not in lemmas]
    return [f"{doc.slug}: {p}" for p in problems]


# Words above the story's level, as a share of the words a learner meets unprepared (core words are taught first).
# Comprehensible input asks for well over 90% known words; the glossary's levels come from the LLM and run strict,
# so this only warns.
MAX_ABOVE_LEVEL = 0.10


def level_problems(doc) -> list[str]:
    """Every target belongs to the curriculum at the story's level or below, with the curriculum's concept."""
    known = curriculum(doc.brief.language)
    if known is None:
        return [f"{doc.slug}: no content/curriculum/{doc.brief.language}.yaml (copy one and list what each level teaches)"]
    problems = []
    for t in doc.brief.targets:
        entry = known.get(t.text)
        if entry is None:
            problems.append(f"{doc.slug}: target '{t.text}' is not in content/curriculum/{doc.brief.language}.yaml "
                            f"(add it at its level, or pick a structure that is)")
        elif above(entry.level, doc.brief.level):
            problems.append(f"{doc.slug}: target '{t.text}' is {entry.level}, the story is {doc.brief.level} "
                            f"(raise the story's level, or pick an easier structure)")
        elif entry.target.concept != t.concept:
            problems.append(f"{doc.slug}: target '{t.text}' has concept '{t.concept}', the curriculum says "
                            f"'{entry.target.concept}' (one meaning, one gesture: make them the same)")
    return problems


def level_warnings(doc) -> list[str]:
    core = {w.lemma for w in doc.story.core_words}
    words = [e for scene in doc.story.scenes for e in scene.glossary if e.lemma not in core]
    hard = sorted({e.lemma for e in words if above(e.level, doc.brief.level)})
    share = sum(1 for e in words if above(e.level, doc.brief.level)) / max(1, len(words))
    if share <= MAX_ABOVE_LEVEL:
        return []
    return [f"{doc.slug} ({doc.brief.level}): {share:.0%} of the words are above its level: {', '.join(hard[:12])}"
            f"{' …' if len(hard) > 12 else ''}  (simpler words in story.yaml, a core word, or a higher level)"]


def translation_gaps(doc, base: str) -> list[str]:
    gap = gaps(doc.brief, doc.story, doc.localizations.get(base))
    if not gap:
        return []
    return [f"{doc.slug} [{base}]: {count(gap)} missing or out of date -> {json.dumps(gap, ensure_ascii=False)[:200]}"
            f"  (fix: storylingo.py localize {doc.slug} {base})"]


def media_gaps(doc) -> list[str]:
    todo = [j for j in media_jobs(doc) if j["have"] != j["want"]]
    if not todo:
        return []
    missing = sum(1 for j in todo if j["have"] is None)
    labels = ", ".join(j["label"] for j in todo[:4]) + (" …" if len(todo) > 4 else "")
    return [f"{doc.slug}: {missing} missing, {len(todo) - missing} out of date ({labels})"
            f"  (fix: storylingo.py media {doc.slug})"]


def edition_gaps(stories) -> list[str]:
    problems = []
    if not editions.WEB_FILE.exists() or editions.WEB_FILE.read_text(encoding="utf-8") != editions.web_json():
        problems.append("web/lib/editions.json is out of date (fix: storylingo.py sync)")
    for e in editions.all_editions().values():
        if e.status == "draft":
            continue
        mine = [d for d in stories if d.status == "published" and d.brief.language == e.target
                and set(d.tags) & set(e.stories.tags) and d.brief.level in e.stories.levels]
        if not mine:
            problems.append(f"{e.slug} ({e.status}): no published {e.target} story with tags {e.stories.tags} "
                            f"at {e.stories.levels} (fix: write a brief in content/briefs/{e.target}/ and generate it)")
    return problems


def phrase_problems(bases: list[str]) -> list[str]:
    """Every target language an edition teaches has its phrases: full levels, meanings, in the database, recorded."""
    problems = []
    targets = sorted({e.target for e in editions.all_editions().values() if e.status != "draft"})
    for language in targets:
        offered = [b for b in db.pair_bases(language) if b in bases]
        problems += phrases.gaps(language, offered)
        sets = phrases.all_sets(language)
        meanings = {b: phrases.meanings(language, b) for b in offered}
        if sets and (changes := db.sync_phrases(language, sets, meanings, dry_run=True)):
            problems.append(f"{language}: database differs ({', '.join(changes)})  (fix: storylingo.py sync)")
        todo = [j for j in phrase_jobs(language) if j["have"] != j["want"]]
        if todo:
            problems.append(f"{language}: {len(todo)} phrases without an up-to-date recording "
                            f"(fix: storylingo.py media-phrases {language})")
    return problems


def check(base: str | None = None) -> bool:
    """Print every problem per area; True when there are none."""
    areas: dict[str, list[str]] = {}
    try:
        all_languages = languages.all_languages()
        editions.all_editions()
        stories = content.all_stories()
    except SystemExit as e:  # a file that does not read stops everything else
        print(f"✗ content files\n    {e}")
        return False
    bases = [base] if base else [c for c, lang in all_languages.items() if lang.is_base]
    offered = {doc.slug: set(db.pair_bases(doc.brief.language)) for doc in stories}
    if base:
        stories = [doc for doc in stories if base in offered[doc.slug]]

    areas["content files"] = [p for doc in stories for p in story_rules(doc)]
    areas["levels"] = [p for doc in stories for p in level_problems(doc)]
    areas["editions"] = edition_gaps(stories) if not base else []
    areas["app setup"] = [p for b in bases for p in app_gaps(b)]
    areas["app texts"] = [f"[{b}] {p}" for b in bases for p in dictionary_gaps(b)]
    areas["translations"] = [p for doc in stories for b in sorted(offered[doc.slug]) if b in bases
                             for p in translation_gaps(doc, b)]
    drift = []
    for doc in stories:
        if changes := db.sync_story(doc, dry_run=True):
            drift.append(f"{doc.slug}: database differs ({', '.join(changes)})  (fix: storylingo.py sync)")
    if not base:
        drift += [f"{slug}: in the database but not in content/ (put the folder back, or remove it by hand)"
                  for slug in db.stories_not_in({doc.slug for doc in stories})]
    areas["database"] = drift + [f"[{b}] {p}" for b in bases for p in db.base_gaps(b)]
    areas["media"] = [p for doc in stories for p in media_gaps(doc)]
    areas["phrases"] = phrase_problems(bases)

    for area, problems in areas.items():
        print(f"{'✓' if not problems else '✗'} {area}" + (f": {len(problems)} problem(s)" if problems else ""))
        for p in problems:
            print(f"    {p}")
    # Worth a look, but not wrong: they do not make the check fail.
    warnings = [w for doc in stories for w in level_warnings(doc)]
    if warnings:
        print(f"⚠ level of the words: {len(warnings)} story(ies) to look at")
        for w in warnings:
            print(f"    {w}")
    ok = not any(areas.values())
    what = f"'{base}'" if base else "Everything"
    print(f"\n{what} is {'complete and in sync' if ok else 'NOT complete'}.")
    return ok
