"""Moving pictures and recordings from one Supabase project to another without making them again (docs/cloud.md).

    storylingo.py media-export           local: every file that matches its text and voice -> pipeline/media-export/
    storylingo.py media-import --cloud   cloud: every file a story needs and the export has (same fingerprint) is uploaded

Files are matched by fingerprint, not by id or path: the cloud database has its own ids (sync made its rows), and a
file made from the same text with the same voice is the same file. What the export does not have, `media` makes.
"""
import json
import shutil
from pathlib import Path

import content
import db
import languages
import media
import phrases
from mediajobs import media_jobs, phrase_jobs

EXPORT = Path(__file__).parent / "media-export"
MANIFEST = EXPORT / "manifest.json"


def _asset(job: dict) -> dict | None:
    """The file a job's row links to now: path, type, maker and sentence marks."""
    table, column, row_id = job["link"]
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select a.storage_path, a.mime_type, a.provider, a.model, a.marks
                from {table} t join assets a on a.id = t.{column} where t.id = %s""",
            (row_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return dict(zip(("path", "mime_type", "provider", "model", "marks"), row))


def export() -> None:
    """Save every up-to-date file of every story, plus the teacher's reactions, with a manifest."""
    if EXPORT.exists():
        shutil.rmtree(EXPORT)
    (EXPORT / "files").mkdir(parents=True)
    manifest: dict = {"files": {}, "feedback": []}
    groups = [(doc.slug, media_jobs(doc)) for doc in content.all_stories()]
    groups += [(f"phrases {lang}", phrase_jobs(lang)) for lang in phrases.languages_with_phrases()]
    for name, jobs in groups:
        saved = 0
        for job in jobs:
            if job["have"] != job["want"] or job["want"] in manifest["files"]:
                continue
            asset = _asset(job)
            if not asset:
                continue
            item = media.download(asset["path"])
            filename = f"{job['want']}.{media.extension(asset['mime_type'])}"
            (EXPORT / "files" / filename).write_bytes(item.data)
            manifest["files"][job["want"]] = {**{k: v for k, v in asset.items() if k != "path"}, "file": filename}
            saved += 1
        print(f"  {name}: {saved} files")
    # The teacher's spoken reactions are not linked to rows: they are plain files per target language.
    for code, lang in languages.all_languages().items():
        if not lang.teacher:
            continue
        for kind, lines in (("yes", lang.teacher.yes), ("no", lang.teacher.no)):
            for i in range(1, len(lines) + 1):
                path = f"feedback/{code}/{kind}-{i}.mp3"
                target = EXPORT / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(media.download(path).data)
                manifest["feedback"].append(path)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(f.stat().st_size for f in EXPORT.rglob("*") if f.is_file()) / 1e6
    print(f"Exported {len(manifest['files'])} files and {len(manifest['feedback'])} reactions ({size:.0f} MB) "
          f"to {EXPORT.name}/. Next: storylingo.py media-import --cloud")


def import_() -> None:
    """Upload what each story needs from the export; report what is left for `media`."""
    if not MANIFEST.exists():
        raise SystemExit("No export yet: run storylingo.py media-export (without --cloud) first.")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for path in manifest["feedback"]:
        media.upload(path, media.Media((EXPORT / path).read_bytes(), "audio/mpeg", "stored", path))
    print(f"  {len(manifest['feedback'])} teacher reactions")
    left = 0
    groups = [(doc.slug, media_jobs(doc)) for doc in content.all_stories()]
    groups += [(f"phrases {lang}", phrase_jobs(lang)) for lang in phrases.languages_with_phrases()]
    for name, jobs in groups:
        copied = 0
        for job in jobs:
            found = manifest["files"].get(job["want"])
            if job["have"] == job["want"] or not found:
                left += job["have"] != job["want"]
                continue
            data = (EXPORT / "files" / found["file"]).read_bytes()
            item = media.Media(data, found["mime_type"], found["provider"], found["model"], found["marks"])
            path = f"{job['path']}.{media.extension(item.mime_type)}"
            media.upload(path, item)
            kind = "image" if job["what"] in ("image", "picture") else "audio"
            asset_id = db.save_asset(kind, path, item.mime_type, item.provider, item.model, item.marks, job["want"])
            db.link_asset(*job["link"], asset_id)
            copied += 1
        print(f"  {name}: {copied} files")
    print("Done." + (f" {left} files were not in the export: storylingo.py media <slug> --cloud makes them." if left else ""))
