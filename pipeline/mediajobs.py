"""What media a story needs, and what it has: shared by `storylingo.py media` (makes) and `check` (counts)."""
import db
import fingerprint
import languages
from content import StoryDoc


def phrase_jobs(language: str) -> list[dict]:
    """The recording of every phrase. Like a single word (same kind, same place), so a phrase that is also a story's
    glossary word has one recording, not two."""
    voice = languages.voice(language)
    return [
        {"what": "word", "label": f"phrase {text}", "have": have, "want": fingerprint.spoken(text, "word", voice),
         "text": text, "path": f"words/{language}/{lexeme_id}", "link": ("lexemes", "audio_asset_id", lexeme_id)}
        for lexeme_id, text, have in db.phrase_plan(language)
    ]


def media_jobs(doc: StoryDoc) -> list[dict]:
    """
    Every picture and recording a story needs, with the fingerprint it should have (`want`) and has now (`have`,
    None when missing). `media` makes the ones where they differ; `check` counts them.
    Files are named by key (s2q3.mp3), so reordering scenes or questions never mixes them up.
    """
    story, language = doc.story, doc.brief.language
    voice = languages.voice(language)
    scenes = {s.key: s for s in story.scenes}
    jobs = []
    plan = db.media_plan(doc.slug)
    for row in plan:
        scene = scenes[row["key"]]
        jobs.append({"what": "image", "label": f"scene {scene.key}: image", "have": row["image"],
                     "want": fingerprint.picture(scene.image_prompt), "prompt": scene.image_prompt,
                     "path": f"stories/{doc.slug}/{scene.key}", "link": ("scenes", "image_asset_id", row["id"])})
    # A picture per core word. Words are shared between stories, so they live under words/<language>/.
    prompts = {w.lemma: w.image_prompt for w in story.core_words}
    for lexeme_id, lemma, have in db.core_word_plan(doc.slug):
        if lemma in prompts:
            jobs.append({"what": "picture", "label": f"word {lemma}: picture", "have": have,
                         "want": fingerprint.picture(prompts[lemma]), "prompt": prompts[lemma],
                         "path": f"words/{language}/{lexeme_id}", "link": ("lexemes", "image_asset_id", lexeme_id)})
    for row in plan:
        scene = scenes[row["key"]]
        jobs.append({"what": "narration", "label": f"scene {scene.key}: narration", "have": row["audio"],
                     "want": fingerprint.narration(scene, voice), "scene": scene,
                     "path": f"stories/{doc.slug}/{scene.key}", "link": ("scenes", "audio_asset_id", row["id"])})
    # Questions after the narration: with a small daily quota the whole story gets told first.
    for row in plan:
        questions = {q.key: q for q in scenes[row["key"]].questions}
        for q_row in row["questions"]:
            q = questions[q_row["key"]]
            jobs.append({"what": "question", "label": f"question {q.key}", "have": q_row["audio"],
                         "want": fingerprint.spoken(q.prompt, "question", voice), "text": q.prompt,
                         "path": f"stories/{doc.slug}/{q.key}", "link": ("questions", "audio_asset_id", q_row["id"])})
    # Every word on its own, for the word cards and the review screen; shared between stories.
    for lexeme_id, text, have in db.words_plan(doc.slug):
        jobs.append({"what": "word", "label": f"word {text}", "have": have,
                     "want": fingerprint.spoken(text, "word", voice), "text": text,
                     "path": f"words/{language}/{lexeme_id}", "link": ("lexemes", "audio_asset_id", lexeme_id)})
    return jobs
