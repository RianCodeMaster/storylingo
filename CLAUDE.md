# StoryLingo — Project Context & Rules

StoryLingo is a language-learning web app (PWA) built on TPRS: short, absurd, exaggerated stories told scene
by scene with images, an expressive voice, gestures to act out, and circling questions that repeat the same
structures many times. Positioning: *built on principles from language and memory research* (comprehensible
input, enactment effect, dual coding, spaced repetition). Never claim "scientifically proven".

**Phase 1:** one user (the owner), German A2. Build it so that more users and more languages need no schema
redesign. **Pace:** build one step at a time and explain each file; the owner reviews before the next step.

## Core design: produce once, play many

1. **Content pipeline** (owner only): a story brief → LLM writes story + circling questions → images and
   audio are generated → saved as `draft` → owner reviews → `published`.
2. **App** (all users): only *plays* published content — rows from the database, files from storage/CDN.
   No AI call per user per story. This is what keeps cost per user near zero.

## Repository layout

```
C:\dev\storylingo\
├── CLAUDE.md
├── README.md              # how to start everything and add a story (Dutch, for the owner)
├── content/               # ALL content, as files: the source of truth (the database is a copy)
│   ├── languages/         # <code>.yaml: everything about one language (voice, teacher phrases, recognition, …)
│   ├── editions/          # <slug>.yaml: one niche at its own address (base, target, welcome texts, color, story tags)
│   ├── curriculum/        # <lang>.yaml: which structures (with concept) each CEFR level teaches
│   ├── phrases/<lang>/    # A1|A2|B1.yaml: the 200 most useful chunks per level; <base>.yaml: their meanings
│   ├── briefs/<lang>/     # input for `generate`
│   └── stories/<lang>/<slug>/  # story.yaml (target language) + <base>.yaml per base language
├── supabase/
│   ├── config.toml        # local Supabase: anonymous sign-in on, public 'assets' bucket
│   └── migrations/        # SQL schema, one migration per change, never edit an applied migration
├── pipeline/              # Python: DeepSeek writes content/, `sync` copies it into the database, `media` makes files
│   └── localgen/          # local generation server (own venv .venv-local): SDXL images, Piper voices
└── web/                   # Next.js PWA; reaches local Supabase through the /sb rewrite
```

**Phase 1 specifics:** everything runs locally (Docker + `supabase start`). Each browser gets an anonymous
learner account. Gestures are emoji plus a description. A story passes five DeepSeek rounds: story + questions,
glossary (tap any word), core words (~6, taught with a picture before the story, then reviewed), voice direction
(an emotion per sentence), and localize (per base language). Images and narration are made locally and
linked through `assets`; the app falls back to the browser voice when a file is missing. Learners can answer the circling
questions out loud: the browser's speech recognition (`web/lib/listen.ts`) only picks which known option was said,
so no LLM and no extra content. After the last questions comes shadowing (`components/Shadowing.tsx`): a few
short sentences with a target structure, played out of the scene audio by the sentence times that localgen returns
and `assets.marks` keeps; the learner's recording stays in the browser.

## Stack (fixed — change only by explicit decision)

| Concern | Choice |
|---|---|
| Database, auth, file storage | Supabase (PostgreSQL), free tier |
| App | Next.js PWA on Vercel |
| Content pipeline | Python, run locally |
| Story text | DeepSeek (owner has a key); quality judged by owner review |
| Voice | Per target language in the `voice:` block of `content/languages/<code>.yaml` (provider, model per emotion, tempo); swapping a voice is a config edit, then `media` remakes that language's audio. German: Piper Thorsten, `thorsten-high` for neutral lines and `thorsten_emotional` for the rest. Rejected: Chatterbox (American accent, hallucinations), Gemini free tier (10 calls/day) |
| Images | SDXL base 1.0, local GPU (RTX 3080 8 GB, CPU offload). Gemini image is the paid alternative (needs credit) |
| Payments | Stripe (web sale, Stripe Tax on) — not before there are other users |

## Content management (read docs/inhoud-beheer.md)

**Edit files in `content/`, never the database.** Then `storylingo.py sync` (in `pipeline/`) copies them in place,
and `storylingo.py check` must end with "complete and in sync"; every problem it lists names its fix.

- **Keys:** scenes and questions have fixed keys in story.yaml (`s2`, `s2q3`). Never change or reuse an existing key:
  answers hang on it. A new scene/question may go without a key; sync gives it a new one (random suffix, never a
  freed number).
- **Fingerprints:** every asset and every scene translation records what it was made from (`pipeline/fingerprint.py`).
  `media` and `localize` redo only what no longer matches; never use `media-clear` just to refresh.
- **Recipes:**
  - Change/add/remove a question: edit story.yaml → `sync` → `media <slug>`.
  - Rewrite a scene: edit story.yaml (text and its `voice:` lines) → `glossary <slug>` (new words) → `sync` →
    `localize` per base it reports → `media <slug>` → `check`.
  - New story: brief in `content/briefs/<lang>/` → `generate <brief>` → owner reads → `media` → `publish` → `check`.
  - New base language: copy `content/languages/nl.yaml` + `web/dictionaries/nl.json` → `sync` → pair in the
    database → `localize-all <code>` → `check <code>`.
  - New target language: copy `content/languages/de.yaml` (voice, teacher, recognition) → `sync` → `feedback <code>`
    → curriculum and briefs → stories.
  - Another voice (e.g. ElevenLabs): edit `voice:` in the language file → `media` per story.
  - New edition (niche): copy a file in `content/editions/`, change slug, languages, texts, color, tags → `sync` →
    `check` (it reports missing stories or translations for that pair).
  - New track (one way in per niche, `/almanya/b1-examen`): add it under `tracks:` in the edition file → `sync`
    (docs/campagnes.md). `storylingo.py funnel` shows visitors → started → finished → back per track and campaign.
  - New product: copy a file in `content/products/` → its content (kind `stories`: stories with its own tag) →
    `sync` → `check` (docs/producten.md). The database lets only owners read a product's stories (policy on
    `stories`, `owns()`); `grant` / `revoke` / `purchases` manage who has what.
  - Free tier / Plus: one membership product per target language (`plus-de.yaml` …) holds the `free` limits and the
    prices (docs/plus.md). Sync marks the first stories per level `free`; the database hides the rest without Plus
    (`has_plus()`), caps new stories per day (`may_start_story()`), and `story_cards` shows titles of locked ones.
- **Phrases section:** per target language 3 x 200 chunks (A1, A2, B1), the same in every edition with that target.
  A phrase is a lexeme (kind 'phrase') plus a `phrases` row (level, position): audio, meanings and spaced repetition
  come from the word machinery. Recipe: `phrases <lang> <level>` → read → `localize-phrases <lang> <base>` → `sync`
  → `media-phrases <lang>` → `check`. A changed text is a new phrase.
- **Audio is MP3** (64 kbit/s, `media.mp3`), part of every recording's fingerprint (`fingerprint.AUDIO_FORMAT`).
- **Levels:** a story's targets must be in `content/curriculum/<lang>.yaml` at its level or below, with the same
  concept; `check` fails otherwise and warns (⚠) when >10% of non-core words are above the level. Learners have a
  level per edition (`enrollments`), chosen on the welcome page, raised when they finished their level; never a lock.
- **Accounts:** one login per person (`profiles`), everything else per edition: `enrollments` (level, where they came
  in) and `sessions.edition`. Everyone starts anonymous; saving progress gives the same account an e-mail address via
  a 6-digit code, a known address logs in instead (`lib/account.ts`, docs/accounts.md). No passwords, no links. No enrollment means a first visit. Editions never show each other: `/` and draft editions
  only when `showsEverything()` (development or `SHOW_EDITIONS=1`); the `editions` table is not readable via the API.
- **Editions:** the app lives under `app/[edition]/` (/duits, /almanya …); the edition fixes base and target language,
  so there is no language menu. `/` is an overview for the owner (`app/(hub)/`), never used in marketing. Language
  pairs follow the editions (`sync`). The method (three pillars, six principles under "why it works") is the same in
  every edition and lives in `web/dictionaries/<base>.json` (`welcome`); say "based on principles from language and
  memory research", never "scientifically proven".
- Language facts live only in `content/languages/*.yaml`; the app reads `web/lib/languages.json`, generated by `sync`
  (never edit it by hand). Read content YAML only through `yamlio` (plain YAML turns `yes`/`no` into booleans).

## Environments (docs/cloud.md)

Local is the workshop, the cloud the shop. Every pipeline command takes `--cloud` (reads `pipeline/.env.cloud`);
without it, it writes to the local Docker database. Media move between projects by fingerprint
(`media-export` locally, `media-import --cloud`), never regenerated just to copy them. The app uses
`NEXT_PUBLIC_SUPABASE_URL` online (direct to Supabase) and the `/sb` rewrite locally (`lib/supabase.ts`).

## Data model rules

- **Concept vs lexeme:** a `concept` is a language-neutral meaning and owns the gesture. A `lexeme` is how a
  language expresses it. A new language reuses all concepts and gestures.
- Content tables are written only by the pipeline (Supabase service role). The app reads published content.
- Row Level Security is on for **every** table. Users only see their own rows in learner tables.
- Generated files live in `assets` with provider, model and cost, so cost per story stays measurable.
- Secrets only in `.env` (git-ignored). Never put API keys in the web app.

## Languages

Base language (app, translations, explanations) and target language (stories, images, audio) are separate layers;
design and steps for new languages in `docs/meertaligheid.md`.

- Database: the story tables hold the target language only. Everything a learner reads in their own language is in
  `story_localizations`, `scene_localizations`, `lexeme_glosses` and `gesture_localizations`, keyed by `base_language`.
  `language_pairs.status` (planned/beta/live) decides what is on offer.
- Pipeline: `generate` writes the story in the target language (gestures and summary in English as the source), then
  `localize.py` makes the layer for every base language of a beta/live pair: `content/stories/<lang>/<slug>/<base>.yaml`.
- App: all pages under `app/[lang]/` (the base language); `proxy.ts` redirects. UI text only from
  `web/dictionaries/<lang>.json` through `useI18n()`; words the teacher says in the target language from
  `phrases()` in `lib/speech.ts` (teacher: in the language file). Story text keeps `dir="ltr"` so a right-to-left app
  works.
- Never hard-code Dutch (or any language) in new code or prompts.
- Base languages now: nl (live), en and ar (beta). `storylingo.py check <base>` must say "complete" before a base
  language goes live. Right-to-left pages keep German text left to right (`dir="ltr"`, `p.story-text`).
