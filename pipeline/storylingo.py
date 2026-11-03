"""StoryLingo content pipeline.

    python storylingo.py generate briefs/hamster-boerse.yaml   brief -> DeepSeek -> stories/<slug>.json -> database (draft)
    python storylingo.py show <slug>                           read the story in the terminal
    python storylingo.py reload <slug>                         after editing stories/<slug>.json by hand
    python storylingo.py glossary <slug>                       (re)make the tap-a-word glossary, also for published stories
    python storylingo.py voice <slug>                          (re)choose an emotion per sentence for the narrator
    python storylingo.py media <slug> [local|gemini|fake] [images|audio]   images (from that provider) + narration (voices.yaml)
    python storylingo.py media-clear <slug> [images|audio]     remove images and/or narration of a story
    python storylingo.py feedback <language>                   the spoken "Ja! Genau!" / "Nein!" reactions, once per language
    python storylingo.py publish <slug>                        make it visible in the app
    python storylingo.py list
"""
import json
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import db  # noqa: E402  (reads DATABASE_URL, so .env must be loaded first)
import media  # noqa: E402
from glossary import add_glossary
from llm import write_story
from models import Brief, Story
from prompts import PROMPT_VERSION
from voice import add_voice

HERE = Path(__file__).parent
STORIES = HERE / "stories"


def story_file(slug: str) -> Path:
    return STORIES / f"{slug}.json"


def save(brief: Brief, story: Story, generation: dict) -> Path:
    STORIES.mkdir(exist_ok=True)
    path = story_file(brief.slug)
    data = {"brief": brief.model_dump(), "generation": generation, "story": story.model_dump()}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def read(slug: str) -> tuple[Brief, Story, dict]:
    path = story_file(slug)
    if not path.exists():
        raise SystemExit(f"{path} does not exist.")
    data = json.loads(path.read_text(encoding="utf-8"))
    return Brief.model_validate(data["brief"]), Story.model_validate(data["story"]), data["generation"]


def show(brief: Brief, story: Story) -> None:
    print(f"\n=== {story.title}  [{brief.language} {brief.level}] ===\n{story.summary}\n")
    for g in story.gestures:
        print(f"  {g.emoji}  {g.concept}: {g.description}")
    for i, scene in enumerate(story.scenes, 1):
        print(f"\n--- Scene {i} ---\n{scene.text}\n  ({scene.translation})")
        if scene.glossary:
            print("  words: " + ", ".join(f"{e.word}={e.gloss}" for e in scene.glossary))
        for q in scene.questions:
            print(f"   ? {q.prompt}  {q.options} -> {q.answer}")
    print()


def make_media(slug: str, provider_name: str, only: str | None = None) -> None:
    """Fill in whatever images and audio a story is still missing. Safe to run again after an error."""
    brief, story, _ = read(slug)
    language = brief.language
    do_images, do_audio = only in (None, "images"), only in (None, "audio")
    maker = media.provider(provider_name) if do_images else None
    # The voice comes from voices.yaml, whatever made the images.
    voice = media.voice(language)
    speaker = media.speaker(voice, fake=provider_name == "fake") if do_audio else None
    # Per-sentence emotions live in the story file; scenes are matched by position.
    lines = {i: [v.model_dump() for v in s.voice] for i, s in enumerate(story.scenes, 1)}
    reference = None
    made = 0

    def store(kind: str, path: str, item: media.Media) -> str:
        nonlocal made
        full = f"stories/{slug}/{path}.{media.extension(item.mime_type)}"
        media.upload(full, item)
        made += 1
        return db.save_asset(kind, full, item.mime_type, item.provider, item.model)

    # All images first, then all audio: a local GPU then switches models only once.
    scenes = db.media_plan(slug)
    for scene in scenes if do_images else []:
        n = scene["position"]
        if scene["image_asset_id"] is None:
            print(f"  scene {n}: image")
            item = media.retry(lambda: maker.image(scene["image_prompt"] or scene["text"], reference))
            db.link_asset("scenes", "image_asset_id", scene["id"], store("image", f"scene-{n}", item))
            reference = reference or item
        elif reference is None and provider_name == "gemini":
            reference = media.download(scene["image_path"])

    for scene in scenes if do_audio else []:
        n = scene["position"]
        if scene["audio_asset_id"] is None:
            print(f"  scene {n}: narration")
            item = media.retry(lambda: speaker.speech(scene["text"], "story", lines.get(n), voice))
            db.link_asset("scenes", "audio_asset_id", scene["id"], store("audio", f"scene-{n}", item))

    # Questions last: with a small daily quota the whole story gets narrated first.
    for scene in scenes if do_audio else []:
        n = scene["position"]
        for q in scene["questions"]:
            if q["audio_asset_id"] is None:
                item = media.retry(lambda: speaker.speech(q["prompt"], "question", None, voice))
                db.link_asset("questions", "audio_asset_id", q["id"], store("audio", f"scene-{n}-q{q['position']}", item))

    # Every word on its own, for the review screen. Words are shared between stories, so they live
    # under words/<language>/ and are made only once.
    words = db.words_without_audio(slug) if do_audio else []
    if words:
        print(f"  {len(words)} words")
    for lexeme_id, text in words:
        item = media.retry(lambda: speaker.speech(text, "word", None, voice))
        full = f"words/{language}/{lexeme_id}.{media.extension(item.mime_type)}"
        media.upload(full, item)
        made += 1
        db.link_asset("lexemes", "audio_asset_id", lexeme_id,
                      db.save_asset("audio", full, item.mime_type, item.provider, item.model))
    print(f"Done: {made} new files for '{slug}'.")


# Short reactions after an answer, spoken once per language and shared by every story.
# The app plays feedback/<lang>/yes-<n>.wav and no-<n>.wav; keep the counts in sync with web/lib/speech.ts
# and raise FEEDBACK_VERSION there after remaking them.
FEEDBACK = {
    "de": {
        "yes": [("Ja! Genau!", "amused"), ("Richtig! Super!", "surprised"), ("Fantastisch!", "amused"), ("Ja, ja, ja!", "surprised")],
        "no": [("Nein, nein, nein!", "surprised"), ("Oh nein!", "surprised")],
    },
}


def make_feedback(language: str) -> None:
    voice = media.voice(language)
    speaker = media.speaker(voice)
    for kind, lines in FEEDBACK[language].items():
        for i, (text, emotion) in enumerate(lines, 1):
            item = speaker.speech(text, "story", [{"text": text, "emotion": emotion}], voice)
            media.upload(f"feedback/{language}/{kind}-{i}.wav", item)
            print(f"  {kind}-{i}: {text} ({emotion})")


def main(argv: list[str]) -> None:
    command = argv[0] if argv else None
    arg = argv[1] if len(argv) > 1 else None
    if command != "list" and not arg:
        raise SystemExit(__doc__)

    if command == "generate":
        brief = Brief.model_validate(yaml.safe_load(Path(arg).read_text(encoding="utf-8")))
        print(f"Writing '{brief.slug}' with DeepSeek...")
        story, usage = write_story(brief)
        generation = {"prompt_version": PROMPT_VERSION, **usage, **add_glossary(brief, story), **add_voice(story)}
        path = save(brief, story, generation)
        db.load_story(brief, story, generation)
        show(brief, story)
        print(f"Saved {path.relative_to(HERE)} and loaded as draft. "
              f"Tokens: {usage['input_tokens']} in / {usage['output_tokens']} out.")
        print(f"Happy with it?  python storylingo.py publish {brief.slug}")
    elif command == "show":
        brief, story, _ = read(arg)
        show(brief, story)
    elif command == "reload":
        brief, story, generation = read(arg)
        db.load_story(brief, story, generation)
        print(f"Reloaded '{arg}' as draft.")
    elif command == "glossary":
        brief, story, generation = read(arg)
        generation.update(add_glossary(brief, story))
        save(brief, story, generation)
        db.update_glossary(brief, story)
        print(f"Glossary updated for '{arg}'.")
    elif command == "voice":
        brief, story, generation = read(arg)
        generation.update(add_voice(story))
        save(brief, story, generation)
        print(f"Voice direction updated for '{arg}'. Remake the audio: media-clear {arg} audio, then media {arg} local")
    elif command == "media":
        try:
            make_media(arg, argv[2] if len(argv) > 2 else "local", argv[3] if len(argv) > 3 else None)
        except Exception as e:  # provider errors (billing, quota) should read as a message, not a traceback
            raise SystemExit(f"Stopped: {e}\nEverything made so far is saved; run the same command again to continue.")
    elif command == "feedback":
        make_feedback(arg)
    elif command == "media-clear":
        print(f"Removed {db.clear_media(arg, argv[2] if len(argv) > 2 else None)} assets from '{arg}'.")
    elif command == "publish":
        db.publish(arg)
    elif command == "list":
        for slug, status, level, title, scenes in db.list_stories():
            print(f"{status:10} {level}  {slug:30} {title} ({scenes} scenes)")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
