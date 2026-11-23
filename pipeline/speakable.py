"""What the voice reads: the text as shown, with its numbers written out in the language itself.

A voice that sees "1000 kilos" in a Spanish story may read "one thousand kilos": digits look the same in every
language. So before a sentence goes to the voice, every number on its own is written out in the story's language
(1000 -> "mil", "tausend", "duizend"). The text on screen keeps its digits; only the recording changes. A number glued
to letters ("HILDE123", a code) is left to the voice, as is anything with a comma or a point in it.
"""
import re

from num2words import num2words

# A whole number standing on its own: not part of a word, a code, a decimal or a time.
NUMBER = re.compile(r"(?<![\w.,:])\d+(?![\w]|[.,:]\d)")

# How people say round numbers, where num2words is more formal: "tausend Minuten", not "eintausend Minuten".
SPOKEN = {
    "de": [(re.compile(r"\bein(hundert|tausend)"), r"\1")],
}


def speakable(text: str, language: str) -> str:
    """The text with each number on its own written out in `language`; unchanged when it has none."""

    def words(match: re.Match) -> str:
        try:
            said = num2words(int(match.group()), lang=language)
        except (NotImplementedError, OverflowError, ValueError):
            return match.group()
        for pattern, replacement in SPOKEN.get(language, []):
            said = pattern.sub(replacement, said)
        return said

    return NUMBER.sub(words, text)
