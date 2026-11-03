"""Images and narration for a story: generated once, uploaded to Supabase Storage, linked through `assets`.

Images come from the provider named on the command line:
- "local":  free, on this machine (localgen/server.py): SDXL on the GPU.
- "gemini": paid alternative with one reference character. Needs GEMINI_API_KEY with credit.
- "fake":   placeholder files, to test the plumbing (storage, database, app) without any model.

Speech comes from the narrator of the story's language in voices.yaml, so changing a voice is a config edit.
Every speaker has the same method: speech(text, kind, lines, voice) -> Media, where kind is "story",
"question" or "word" and lines are the sentences with their emotion (only for story narration).
"""
import array
import io
import os
import struct
import time
import wave
import zlib
from dataclasses import dataclass

import httpx
import yaml

VOICES_FILE = os.path.join(os.path.dirname(__file__), "voices.yaml")
STORAGE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
BUCKET = "assets"

IMAGE_STYLE = (
    "Colourful, playful cartoon illustration for a language-learning story. Thick clean outlines, "
    "big expressive exaggerated faces, warm bright colours, simple background, landscape format. "
    "Absolutely no text, letters or numbers in the image."
)
# Voice direction is written in the story's own language: English directions gave German an English accent.
# It goes in the system instruction, so the model follows it but never reads it aloud.
VOICE_DIRECTIONS = {
    "de": {
        "story": (
            "Du bist ein theatralischer Geschichtenerzähler und deutscher Muttersprachler. Sprich akzentfreies "
            "Hochdeutsch, langsam und sehr deutlich, mit großen Gefühlen: staune bei Überraschungen, flüstere "
            "Geheimnisse, klinge ängstlich, wenn jemand Angst hat. Sprich ausschließlich den Text, den du bekommst."
        ),
        "question": (
            "Du bist ein begeisterter Deutschlehrer und deutscher Muttersprachler. Sprich akzentfreies Hochdeutsch. "
            "Stelle die Frage langsam, deutlich und neugierig. Sprich ausschließlich den Text, den du bekommst."
        ),
    },
}
LANGUAGE_CODES = {"de": "de-DE", "nl": "nl-NL", "es": "es-ES", "fr": "fr-FR", "en": "en-US"}


@dataclass
class Media:
    data: bytes
    mime_type: str
    provider: str
    model: str


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------
class Gemini:
    def __init__(self):
        from google import genai

        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise SystemExit("GEMINI_API_KEY is not set (see pipeline/.env.example).")
        self.client = genai.Client(api_key=key)
        self.image_model = os.environ.get("GEMINI_IMAGE_MODEL") or self._find_model("image")
        self.tts_model = os.environ.get("GEMINI_TTS_MODEL") or self._find_model("tts")
        self.voice = os.environ.get("GEMINI_VOICE", "Puck")
        print(f"  gemini: image={self.image_model} voice={self.tts_model}/{self.voice}")

    def _find_model(self, kind: str) -> str:
        """Pick the newest flash model of a kind, so model renames do not break the pipeline."""
        names = [m.name.removeprefix("models/") for m in self.client.models.list()]
        # Stable models first, then newest version.
        candidates = sorted(
            (n for n in names if kind in n and "flash" in n and "lite" not in n),
            key=lambda n: ("preview" not in n, n),
            reverse=True,
        )
        if not candidates:
            raise SystemExit(f"No Gemini {kind} model found; set GEMINI_{kind.upper()}_MODEL.")
        return candidates[0]

    def picture(self, prompt: str) -> Media:
        return self.image(f"One simple picture, a single subject on a plain background: {prompt}", None)

    def image(self, prompt: str, reference: Media | None) -> Media:
        from google.genai import types

        contents: list = [f"{IMAGE_STYLE}\n\nScene: {prompt}"]
        if reference:
            # The first scene's picture keeps the main character looking the same everywhere.
            contents = [
                types.Part.from_bytes(data=reference.data, mime_type=reference.mime_type),
                f"{IMAGE_STYLE}\n\nDraw the same main character as in this picture, in a new scene: {prompt}",
            ]
        response = self.client.models.generate_content(
            model=self.image_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="4:3"),
            ),
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                return Media(part.inline_data.data, part.inline_data.mime_type or "image/png", "gemini", self.image_model)
        raise RuntimeError("Gemini returned no image")

    def speech(self, text: str, kind: str, lines: list[dict] | None, voice: dict) -> Media:
        from google.genai import types

        language = voice["language"]
        direction = VOICE_DIRECTIONS[language]["question" if kind == "question" else "story"]
        speech_config = types.SpeechConfig(
            language_code=LANGUAGE_CODES.get(language, language),
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.voice)),
        )

        def call(contents: str, system: str | None):
            return self.client.models.generate_content(
                model=self.tts_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system, response_modalities=["AUDIO"], speech_config=speech_config
                ),
            )

        try:
            response = call(text, direction)
        except Exception as e:
            if "Developer instruction is not enabled" not in str(e):
                raise
            # Models without a system instruction: director's notes and transcript as clearly separate parts.
            response = call(f"### REGIEANWEISUNG (nicht vorlesen)\n{direction}\n\n### TRANSKRIPT\n{text}", None)
        pcm = response.candidates[0].content.parts[0].inline_data.data
        return Media(_wav(_trim_tail(pcm)), "audio/wav", "gemini", f"{self.tts_model}/{self.voice}")


# ---------------------------------------------------------------------------
# Local (localgen/server.py): free and unlimited, slightly lower image quality
# ---------------------------------------------------------------------------
class Localgen:
    def __init__(self):
        self.url = os.environ.get("LOCALGEN_URL", "http://127.0.0.1:8765")
        try:
            httpx.get(f"{self.url}/health", timeout=5).raise_for_status()
        except httpx.HTTPError:
            raise SystemExit(f"Local generator not running at {self.url}. Start it: .venv-local/Scripts/python localgen/server.py")

    def _post(self, route: str, body: dict) -> bytes:
        # The first call loads a model, which takes a while.
        response = httpx.post(f"{self.url}/{route}", json=body, timeout=600)
        if response.status_code != 200:
            raise RuntimeError(f"localgen {route}: {response.text}")
        return response.content


class Local(Localgen):
    # SDXL reads only about 75 words, so the scene comes first and the style stays short.
    STYLE = "cartoon illustration for a children's story, thick clean outlines, bright warm colours, big expressive faces, simple background"
    NEGATIVE = "text, letters, words, watermark, signature, photo, realistic, blurry, deformed, extra limbs, extra fingers"

    def image(self, prompt: str, reference: Media | None) -> Media:
        # Same seed for every scene of every story: keeps the drawing style steady.
        data = self._post("image", {"prompt": f"{prompt}. {self.STYLE}", "negative_prompt": self.NEGATIVE, "seed": 1234})
        return Media(data, "image/png", "local", "sdxl-base-1.0")

    WORD_STYLE = "simple cartoon sticker, one subject in the centre, thick clean outlines, bright warm colours, plain light background"

    def picture(self, prompt: str) -> Media:
        """A square picture of one word: smaller and simpler than a scene, so it reads at a glance."""
        data = self._post("image", {
            "prompt": f"{prompt}. {self.WORD_STYLE}", "negative_prompt": self.NEGATIVE,
            "seed": 1234, "width": 768, "height": 768, "steps": 24,
        })
        return Media(data, "image/png", "local", "sdxl-base-1.0")


class Piper(Localgen):
    """Native-speaker voices; each sentence gets the style that voices.yaml gives its emotion."""

    def speech(self, text: str, kind: str, lines: list[dict] | None, voice: dict) -> Media:
        lines = lines or [{"text": text, "emotion": voice[kind] if kind in ("question", "word") else "neutral"}]
        styles = voice["styles"]
        styled = [
            {"text": line["text"], "style": {**voice.get("settings", {}), **styles.get(line["emotion"], styles["neutral"])}}
            for line in lines
        ]
        data = self._post("speech", {"lines": styled, "pause": voice.get("pause", 0.4)})
        models = sorted({line["style"]["model"] for line in styled})
        return Media(data, "audio/wav", "piper", "+".join(models))


# ---------------------------------------------------------------------------
# Fake (plumbing tests)
# ---------------------------------------------------------------------------
class Fake:
    def image(self, prompt: str, reference: Media | None) -> Media:
        return Media(_png(64, 48, (0, 214, 143)), "image/png", "fake", "placeholder")

    def picture(self, prompt: str) -> Media:
        return Media(_png(48, 48, (255, 196, 0)), "image/png", "fake", "placeholder")

    def speech(self, text: str, kind: str, lines: list[dict] | None, voice: dict) -> Media:
        return Media(_wav(b"\x00\x00" * 24000), "audio/wav", "fake", "silence")


def retry(make, attempts: int = 6, wait: float = 20.0):
    """Free tiers allow only a few calls per minute: on a rate limit (429), wait and try again."""
    for attempt in range(1, attempts + 1):
        try:
            return make()
        except Exception as e:
            # A daily limit does not reset by waiting a minute: stop straight away.
            if "429" not in str(e) or "per day" in str(e) or attempt == attempts:
                raise
            print(f"    rate limited, waiting {wait:.0f}s ({attempt}/{attempts - 1})")
            time.sleep(wait)
            wait *= 1.5


def provider(name: str):
    """The image maker named on the command line."""
    return {"gemini": Gemini, "local": Local, "fake": Fake}[name]()


SPEAKERS = {"piper": Piper, "gemini": Gemini, "fake": Fake}


def voice(language: str) -> dict:
    """The narrator profile of a language, from voices.yaml."""
    with open(VOICES_FILE, encoding="utf-8") as f:
        voices = yaml.safe_load(f)
    if language not in voices:
        raise SystemExit(f"No voice for '{language}' in voices.yaml.")
    return {**voices[language], "language": language}


def speaker(voice: dict, fake: bool = False):
    """The engine that speaks with this voice; fake when testing the plumbing."""
    return Fake() if fake else SPEAKERS[voice["provider"]]()


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
def upload(path: str, media: Media) -> None:
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not key:
        raise SystemExit("SUPABASE_SECRET_KEY is not set (see pipeline/.env.example).")
    response = httpx.post(
        f"{STORAGE_URL}/storage/v1/object/{BUCKET}/{path}",
        content=media.data,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": media.mime_type, "x-upsert": "true"},
        timeout=60,
    )
    response.raise_for_status()


def download(path: str) -> Media:
    """Fetch an earlier image back, to use it as the character reference."""
    response = httpx.get(f"{STORAGE_URL}/storage/v1/object/public/{BUCKET}/{path}", timeout=60)
    response.raise_for_status()
    return Media(response.content, response.headers["content-type"].split(";")[0], "stored", path)


def extension(mime_type: str) -> str:
    return {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/wav": "wav", "audio/mpeg": "mp3"}[mime_type]


# ---------------------------------------------------------------------------
# File formats
# ---------------------------------------------------------------------------
def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Gemini speech is raw 16-bit mono PCM; browsers need a WAV header around it."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buffer.getvalue()


def _trim_tail(pcm: bytes, rate: int = 24000) -> bytes:
    """Gemini speech ends with a short burst of noise after the last silence. Cut it off.

    Walk back from the end in 10 ms steps: skip the loud tail (at most 0.5 s), and once at least
    100 ms of silence follows, cut there and keep a short natural pause.
    """
    samples = array.array("h", pcm[: len(pcm) // 2 * 2])
    step = rate // 100
    loud = lambda i: max((abs(x) for x in samples[i : i + step]), default=0) > 1500  # noqa: E731
    end = len(samples)
    i = end - step
    while i > 0 and end - i < rate // 2 and loud(i):
        i -= step
    silence_end = i + step
    while i > 0 and not loud(i):
        i -= step
    if silence_end - (i + step) >= rate // 10 and silence_end < end:
        cut = min(i + step + rate // 4, silence_end)
        return samples[:cut].tobytes()
    return pcm


def _png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """A single-colour PNG, written by hand so the fake provider needs no image library."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    row = b"\x00" + bytes(rgb) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(row * height))
        + chunk(b"IEND", b"")
    )
