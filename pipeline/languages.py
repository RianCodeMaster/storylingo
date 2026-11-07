"""Every language, read from content/languages/<code>.yaml: the one place where a language is described.

The pipeline asks this module for names, voices and teacher phrases; `sync` writes the database rows and
web/lib/languages.json, which the app reads for the same things.
"""
import json
import unicodedata
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, model_validator

import yamlio
from models import Emotion

ROOT = Path(__file__).parent.parent
LANGUAGES = ROOT / "content" / "languages"
WEB_FILE = ROOT / "web" / "lib" / "languages.json"
DICTIONARIES = ROOT / "web" / "dictionaries"


class Line(BaseModel):
    text: str
    emotion: Emotion = "neutral"


class Teacher(BaseModel):
    yes: list[Line]
    no: list[Line]
    next: str
    done: str


class Language(BaseModel):
    code: str
    name: str                                  # in the language itself, for the language menu
    english: str                               # for prompts
    roles: list[Literal["base", "target"]]
    direction: Literal["ltr", "rtl"] = "ltr"
    script: Literal["latin", "arabic"] = "latin"
    speech_tag: str | None = None              # speech recognition and the browser voice, e.g. de-DE
    plural_forms: list[Literal["zero", "one", "two", "few", "many", "other"]]
    teacher: Teacher | None = None             # target languages only
    recognition: dict[str, str] = {}
    voice: dict | None = None                  # target languages only; see de.yaml

    @model_validator(mode="after")
    def complete(self):
        if "target" in self.roles:
            missing = [f for f in ("teacher", "voice", "speech_tag") if getattr(self, f) is None]
            if missing:
                raise ValueError(f"a target language needs {', '.join(missing)}")
        if "other" not in self.plural_forms:
            raise ValueError("plural_forms always include 'other'")
        return self

    @property
    def is_base(self) -> bool:
        return "base" in self.roles

    @property
    def is_target(self) -> bool:
        return "target" in self.roles


@cache
def all_languages() -> dict[str, Language]:
    languages = {}
    for path in sorted(LANGUAGES.glob("*.yaml")):
        try:
            language = Language.model_validate(yamlio.load(path))
        except Exception as e:
            raise SystemExit(f"{path.relative_to(ROOT)}: {e}")
        if language.code != path.stem:
            raise SystemExit(f"{path.relative_to(ROOT)}: code '{language.code}' must match the file name")
        languages[language.code] = language
    return languages


def get(code: str) -> Language:
    if code not in all_languages():
        raise SystemExit(f"Unknown language '{code}': add content/languages/{code}.yaml")
    return all_languages()[code]


def english(code: str) -> str:
    """The language's name in English, as the prompts use it."""
    return get(code).english


def voice(code: str) -> dict:
    """The narrator profile of a target language."""
    language = get(code)
    if not language.voice:
        raise SystemExit(f"'{code}' has no voice: it is not a target language (content/languages/{code}.yaml).")
    return {**language.voice, "language": code}


def _plain(word: str) -> str:
    """As the app compares words: lower case, no accents, ß as ss (web/lib/listen.ts)."""
    word = word.lower().replace("ß", "ss")
    return "".join(c for c in unicodedata.normalize("NFD", word) if not unicodedata.combining(c))


def web_data() -> dict:
    """What the app needs to know about each language. Only base languages with a dictionary can be chosen."""
    data = {}
    for code, lang in all_languages().items():
        data[code] = {
            "name": lang.name,
            "direction": lang.direction,
            "script": lang.script,
            "speechTag": lang.speech_tag,
            "base": lang.is_base and (DICTIONARIES / f"{code}.json").exists(),
            "target": lang.is_target,
        }
        if lang.teacher:
            data[code]["teacher"] = {
                "yes": [line.text for line in lang.teacher.yes],
                "no": [line.text for line in lang.teacher.no],
                "next": lang.teacher.next,
                "done": lang.teacher.done,
            }
        if lang.recognition:
            data[code]["recognition"] = {_plain(k): _plain(v) for k, v in lang.recognition.items()}
    return data


def web_json() -> str:
    return json.dumps(web_data(), ensure_ascii=False, indent=2) + "\n"


def write_web() -> bool:
    """Write web/lib/languages.json; True when it changed."""
    text = web_json()
    if WEB_FILE.exists() and WEB_FILE.read_text(encoding="utf-8") == text:
        return False
    WEB_FILE.write_text(text, encoding="utf-8", newline="\n")
    return True
