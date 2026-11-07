"""StoryLingo content pipeline. All content lives in content/ (docs/inhoud-beheer.md); the database is a copy.

    python storylingo.py sync [slug]                           make the database match content/ (in place: progress stays)
    python storylingo.py check [base]                          is everything complete and in sync? says how to fix what is not
    python storylingo.py generate content/briefs/de/<slug>.yaml  brief -> DeepSeek -> content/stories/de/<slug>/ (draft)
    python storylingo.py show <slug>                           read the story in the terminal
    python storylingo.py publish <slug>                        status: published in story.yaml, then sync
    python storylingo.py glossary <slug>                       (re)make the tap-a-word glossary
    python storylingo.py core <slug>                           (re)choose the ~6 core words taught with a picture before the story
    python storylingo.py voice <slug>                          (re)choose an emotion per sentence for the narrator
    python storylingo.py localize <slug> <base>                translations, meanings, tips and gestures for one base language
    python storylingo.py localize-all <base>                   the same for every story whose language that base learns
    python storylingo.py media <slug> [local|gemini|fake] [images|audio]   images + narration that are missing or out of date
    python storylingo.py media-clear <slug> [images|audio]     forget the images and/or narration of a story
    python storylingo.py feedback <language>                   the teacher's spoken "Ja! Genau!" / "Nein!", once per language
    python storylingo.py list                                  every story in the database
    python storylingo.py phrases <language> <level>            DeepSeek drafts the level's phrases (up to 200) in content/phrases/
    python storylingo.py localize-phrases <language> <base>    their meanings for one base language
    python storylingo.py media-phrases <language>              their recordings (missing or out of date)
    python storylingo.py media-export                          copy every picture and recording out of the local database
    python storylingo.py media-import --cloud                  … and into the cloud (instead of making them again)

Add --cloud to any command to work on the cloud project (pipeline/.env.cloud) instead of the local one (pipeline/.env).
Content always comes from content/; only the database and storage it writes to change. See docs/cloud.md.
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

# Local by default; --cloud writes to the cloud project instead (docs/cloud.md).
CLOUD = "--cloud" in sys.argv
if CLOUD:
    sys.argv.remove("--cloud")
    if not (Path(__file__).parent / ".env.cloud").exists():
        raise SystemExit("--cloud needs pipeline/.env.cloud (copy .env.cloud.example; see docs/cloud.md).")
    load_dotenv(Path(__file__).parent / ".env.cloud", override=True)
    print("== CLOUD ==")
load_dotenv(Path(__file__).parent / ".env")

import content  # noqa: E402
import db  # noqa: E402  (reads DATABASE_URL, so .env must be loaded first)
import editions  # noqa: E402
import languages  # noqa: E402
import media  # noqa: E402
import phrases  # noqa: E402
import transfer  # noqa: E402
import yamlio  # noqa: E402
from check import check  # noqa: E402
from content import StoryDoc  # noqa: E402
from core import add_core_words  # noqa: E402
from glossary import add_glossary  # noqa: E402
from llm import write_story  # noqa: E402
from localize import localize, localize_words  # noqa: E402
from mediajobs import media_jobs, phrase_jobs  # noqa: E402
from models import Brief, Localization, Story  # noqa: E402
from prompts import PROMPT_VERSION  # noqa: E402
from voice import add_voice  # noqa: E402

HERE = Path(__file__).parent


def store(doc: StoryDoc) -> None:
    """Write the story files, then bring the database copy in line with them."""
    folder = content.save(doc)
    changes = db.sync_story(doc)
    print(f"Saved {folder.relative_to(content.ROOT)}" + (f"; database: {', '.join(changes)}" if changes else ""))


def sync(slug: str | None = None) -> None:
    changes = db.sync_languages(languages.all_languages())
    changes += db.sync_editions(editions.all_editions()) + db.sync_pairs(editions.pairs())
    for change in changes:
        print(f"  {change}")
    if languages.write_web():
        print("  web/lib/languages.json updated")
    if editions.write_web():
        print("  web/lib/editions.json updated")
    for language in phrases.languages_with_phrases() if not slug else []:
        bases = [b for b in languages.all_languages() if languages.get(b).is_base]
        changes = db.sync_phrases(language, phrases.all_sets(language), {b: phrases.meanings(language, b) for b in bases})
        print(f"  phrases {language}: " + (", ".join(changes) if changes else "up to date"))
    docs = [content.read(slug)] if slug else content.all_stories()
    for doc in docs:
        # A scene or question added by hand may have no key yet: give it one in the file first.
        if any(not s.key or any(not q.key for q in s.questions) for s in doc.story.scenes):
            content.save(doc)
        changes = db.sync_story(doc)
        print(f"  {doc.brief.language}/{doc.slug}: " + (", ".join(changes) if changes else "up to date"))


def add_localization(doc: StoryDoc, base: str) -> None:
    doc.localizations[base], usage = localize(doc.brief, doc.story, base, doc.localizations.get(base))
    doc.generation.update(usage)


def show(brief: Brief, story: Story, localizations: dict[str, Localization]) -> None:
    # Show the story with the first base-language layer, so it can be read and checked in one go.
    base = next(iter(sorted(localizations)), None)
    loc = localizations.get(base)
    print(f"\n=== {story.title}  [{brief.language} {brief.level}] ===\n{loc.summary if loc else story.summary}\n")
    for g in story.gestures:
        print(f"  {g.emoji}  {g.concept}: {loc.gestures.get(g.concept) if loc else g.description}")
    if loc:
        for text, meaning in loc.targets.items():
            print(f"  {text} = {meaning.gloss}" + (f"  ({meaning.note})" if meaning.note else ""))
    if story.core_words:
        print("  core words: " + ", ".join(f"{w.lemma}={loc.words.get(w.lemma, '?') if loc else '?'}" for w in story.core_words))
    for i, scene in enumerate(story.scenes, 1):
        scene_loc = loc.scenes[i - 1] if loc else None
        print(f"\n--- Scene {i} ---\n{scene.text}" + (f"\n  ({scene_loc.translation})" if scene_loc else ""))
        if scene.glossary:
            glosses = scene_loc.glosses if scene_loc else {}
            print("  words: " + ", ".join(f"{e.word}={glosses.get(e.word, '?')}" for e in scene.glossary))
        for q in scene.questions:
            print(f"   ? {q.prompt}  {q.options} -> {q.answer}")
    print()


def make_media(slug: str, provider_name: str, only: str | None = None, language: str | None = None) -> None:
    """
    Make every image and recording that is missing or out of date. Safe to run again after an error.
    With `language` (and no slug): the recordings of that language's phrases.
    """
    doc = content.read(slug) if slug else None
    voice = languages.voice(doc.brief.language if doc else language)
    wanted = {"images": ("image", "picture"), "audio": ("narration", "question", "word")}
    jobs = media_jobs(doc) if doc else phrase_jobs(language)
    todo = [j for j in jobs if j["have"] != j["want"] and (only is None or j["what"] in wanted[only])]
    slug = slug or f"{language} phrases"
    if not todo:
        print(f"Nothing to make for '{slug}': every image and recording matches its text and voice.")
        return
    images = any(j["what"] in ("image", "picture") for j in todo)
    maker = media.provider(provider_name) if images else None
    speaker = media.speaker(voice, fake=provider_name == "fake")
    # The first scene image is the reference for the character's look (Gemini); with a local GPU it is unused.
    reference = None
    for job in todo:
        print(f"  {job['label']}" + (" (out of date)" if job["have"] else ""))
        if job["what"] == "image":
            item = media.retry(lambda: maker.image(job["prompt"], reference))
            reference = reference or item
        elif job["what"] == "picture":
            item = media.retry(lambda: maker.picture(job["prompt"]))
        elif job["what"] == "narration":
            lines = [v.model_dump() for v in job["scene"].voice]
            item = media.retry(lambda: speaker.speech(job["scene"].text, "story", lines, voice))
        else:
            item = media.retry(lambda: speaker.speech(job["text"], job["what"], None, voice))
        path = f"{job['path']}.{media.extension(item.mime_type)}"
        media.upload(path, item)
        kind = "image" if job["what"] in ("image", "picture") else "audio"
        asset_id = db.save_asset(kind, path, item.mime_type, item.provider, item.model, item.marks, job["want"])
        db.link_asset(*job["link"][:2], job["link"][2], asset_id)
    print(f"Done: {len(todo)} files for '{slug}'.")


def make_feedback(language: str) -> None:
    """The teacher's short reactions after an answer (teacher.yes / teacher.no in the language file), spoken once per
    language and shared by every story. The app plays feedback/<lang>/yes-<n>.mp3 and no-<n>.mp3; raise
    FEEDBACK_VERSION in web/lib/speech.ts after remaking them."""
    voice = languages.voice(language)
    speaker = media.speaker(voice)
    teacher = languages.get(language).teacher
    for kind, lines in (("yes", teacher.yes), ("no", teacher.no)):
        for i, line in enumerate(lines, 1):
            item = speaker.speech(line.text, "story", [{"text": line.text, "emotion": line.emotion}], voice)
            media.upload(f"feedback/{language}/{kind}-{i}.{media.extension(item.mime_type)}", item)
            print(f"  {kind}-{i}: {line.text} ({line.emotion})")


def main(argv: list[str]) -> None:
    command = argv[0] if argv else None
    arg = argv[1] if len(argv) > 1 else None
    if command not in ("list", "sync", "check", "media-export", "media-import") and not arg:
        raise SystemExit(__doc__)

    if command == "sync":
        sync(arg)
    elif command == "check":
        if not check(arg):
            raise SystemExit(1)
    elif command == "generate":
        data = yamlio.load(Path(arg))
        tags = data.pop("tags", [])
        brief = Brief.model_validate(data)
        print(f"Writing '{brief.slug}' with DeepSeek...")
        story, usage = write_story(brief)
        doc = StoryDoc(brief, story, "draft", tags, {"prompt_version": PROMPT_VERSION, **usage})
        doc.generation.update({**add_glossary(brief, story), **add_core_words(brief, story), **add_voice(story)})
        for base in db.pair_bases(brief.language):
            add_localization(doc, base)
        store(doc)
        show(brief, story, doc.localizations)
        print(f"Tokens: {usage['input_tokens']} in / {usage['output_tokens']} out. Read it, edit story.yaml if needed, "
              f"then: storylingo.py media {brief.slug}  and  storylingo.py publish {brief.slug}")
    elif command == "show":
        doc = content.read(arg)
        show(doc.brief, doc.story, doc.localizations)
    elif command == "publish":
        doc = content.read(arg)
        doc.status = "published"
        store(doc)
    elif command == "glossary":
        doc = content.read(arg)
        doc.generation.update(add_glossary(doc.brief, doc.story))
        # New words need new meanings in every base language.
        for base in list(doc.localizations):
            add_localization(doc, base)
        store(doc)
    elif command == "core":
        doc = content.read(arg)
        doc.generation.update(add_core_words(doc.brief, doc.story))
        # Only the new words need meanings: the checked translations stay as they are.
        for base, loc in doc.localizations.items():
            loc.words, usage = localize_words(doc.brief, doc.story, base)
            doc.generation.update(usage)
        store(doc)
        print(f"Pictures for the new words: python storylingo.py media {arg} local images")
    elif command == "voice":
        doc = content.read(arg)
        doc.generation.update(add_voice(doc.story))
        store(doc)
        print(f"Remake the narration: python storylingo.py media {arg}")
    elif command == "localize":
        if len(argv) < 3:
            raise SystemExit(__doc__)
        doc = content.read(arg)
        add_localization(doc, argv[2])
        store(doc)
    elif command == "localize-all":
        for doc in content.all_stories():
            if arg in db.pair_bases(doc.brief.language, ("planned", "beta", "live")):
                print(f"== {doc.slug}")
                add_localization(doc, arg)
                store(doc)
    elif command == "media":
        try:
            make_media(arg, argv[2] if len(argv) > 2 else "local", argv[3] if len(argv) > 3 else None)
        except Exception as e:  # provider errors (billing, quota) should read as a message, not a traceback
            raise SystemExit(f"Stopped: {e}\nEverything made so far is saved; run the same command again to continue.")
    elif command == "feedback":
        make_feedback(arg)
    elif command == "media-clear":
        print(f"Removed {db.clear_media(arg, argv[2] if len(argv) > 2 else None)} assets from '{arg}'.")
    elif command == "phrases":
        if len(argv) < 3:
            raise SystemExit(__doc__)
        phrases.generate(arg, argv[2])
        print(f"Read content/phrases/{arg}/{argv[2]}.yaml, then: localize-phrases, sync, media-phrases {arg}")
    elif command == "localize-phrases":
        if len(argv) < 3:
            raise SystemExit(__doc__)
        phrases.localize(arg, argv[2])
    elif command == "media-phrases":
        try:
            make_media(None, "local", "audio", language=arg)
        except Exception as e:
            raise SystemExit(f"Stopped: {e}\nEverything made so far is saved; run the same command again to continue.")
    elif command == "media-export":
        if CLOUD:
            raise SystemExit("Export from the local project: run it without --cloud.")
        transfer.export()
    elif command == "media-import":
        if not CLOUD:
            raise SystemExit("Import into the cloud project: add --cloud.")
        transfer.import_()
    elif command == "list":
        for slug, status, level, title, scenes in db.list_stories():
            print(f"{status:10} {level}  {slug:30} {title} ({scenes} scenes)")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
