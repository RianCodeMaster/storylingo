"""Hear ElevenLabs voices before choosing one: a few short samples per language, as MP3 files.

    python voice_samples.py                    every language, the default voices
    python voice_samples.py nl george jessica ...  one language, the voices you name (a name below or an ID
                                                   from elevenlabs.io > Voices); add --v3 for only the acting model

Costs about 150 characters per sample (the free plan has 10,000 a month). Files land in media-export/samples/.
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
import media  # noqa: E402

# Short story lines with a twist and a circling question, the way the app uses a voice.
TEXTS = {
    "de": [("Lena hat einen Hund.", "neutral"), ("Der Hund ist riesig!", "surprised"),
           ("Er ist so groß wie ein Haus.", "whisper"), ("Hat Lena eine Katze?", "amused")],
    "nl": [("Sanne heeft een hond.", "neutral"), ("De hond is reusachtig!", "surprised"),
           ("Hij is zo groot als een huis.", "whisper"), ("Heeft Sanne een kat?", "amused")],
    "es": [("Lucía tiene un perro.", "neutral"), ("¡El perro es enorme!", "surprised"),
           ("Es tan grande como una casa.", "whisper"), ("¿Tiene Lucía un gato?", "amused")],
}
# Ready-made voices every account has; they speak all three languages.
VOICES = {"sarah": "EXAVITQu4vr4xnSDxMaL", "laura": "FGY2WhTYpPnrIDTdsKH5", "george": "JBFqnCBsd6RMkjVDRZzb"}
STYLES = {  # lower stability = livelier; the same mapping goes into the language file later
    "neutral": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2},
    "surprised": {"stability": 0.3, "similarity_boost": 0.8, "style": 0.6},
    "amused": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.5},
    "whisper": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.4},
}
# More ready-made voices, chosen for an expressive, storytelling sound.
MORE = {"jessica": "cgSgspJ2msm6clMCkdW9", "charlie": "IKne3meq5aSn9XLyUdCD", "brian": "nPczCjzI2devNBz1zQrb",
        "lily": "pFZP5JQG7iQjIQuC4Bku"}
# v3 acts on audio tags (written in English, for every language) and at stability 0.0 ("creative") the most.
V3_TAGS = {"neutral": "[curious]", "surprised": "[gasps] [excited]", "amused": "[playfully]", "whisper": "[whispers]"}
V3_STABILITY = 0.0


def sample(eleven: media.ElevenLabs, language: str, name: str, voice_id: str, model: str, out: Path) -> None:
    styles = {
        emotion: {**s, "voice_id": voice_id, "model": model,
                  **({"tag": V3_TAGS[emotion], "stability": V3_STABILITY} if model == "eleven_v3" else {})}
        for emotion, s in STYLES.items()
    }
    lines = [{"text": t, "emotion": e} for t, e in TEXTS[language]]
    result = eleven.speech("", "story", lines, {"styles": styles, "pause": 0.5})
    path = out / f"{language}-{name}-{model.replace('eleven_', '')}.mp3"
    path.write_bytes(result.data)
    print(f"  {path.name}")


def main() -> None:
    out = Path(__file__).parent / "media-export" / "samples"
    out.mkdir(parents=True, exist_ok=True)
    eleven = media.ElevenLabs()
    args = sys.argv[1:]
    v3_only = "--v3" in args
    args = [a for a in args if a != "--v3"]
    known = {**VOICES, **MORE}
    language = args[0] if args else None
    # Voices as names (sarah, george, jessica ...), name=ID or a bare ID from the Voice Library.
    chosen = dict((a.split("=", 1) if "=" in a else (a, known.get(a, a))) for a in args[1:]) or VOICES
    for lang in [language] if language else TEXTS:
        for name, voice_id in chosen.items():
            if not v3_only:
                sample(eleven, lang, name, voice_id, "eleven_multilingual_v2", out)
            elif voice_id:
                sample(eleven, lang, name, voice_id, "eleven_v3", out)
        if not v3_only:
            # One voice also with the newest model, which acts more but is less steady.
            first = next(iter(chosen.items()))
            sample(eleven, lang, first[0], first[1], "eleven_v3", out)


if __name__ == "__main__":
    main()
