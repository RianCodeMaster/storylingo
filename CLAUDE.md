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
├── supabase/
│   ├── config.toml        # local Supabase: anonymous sign-in on, public 'assets' bucket
│   └── migrations/        # SQL schema, one migration per change, never edit an applied migration
├── pipeline/              # Python content pipeline: briefs/ -> DeepSeek -> stories/*.json -> database
│   └── localgen/          # local generation server (own venv .venv-local): SDXL images, Piper voices
└── web/                   # Next.js PWA; reaches local Supabase through the /sb rewrite
```

**Phase 1 specifics:** everything runs locally (Docker + `supabase start`). Each browser gets an anonymous
learner account. Gestures are emoji plus a description. A story passes five DeepSeek rounds: story + questions,
glossary (tap any word), core words (~6, taught with a picture before the story, then reviewed), voice direction
(an emotion per sentence), and localize (per base language). Images and narration are made locally and
linked through `assets`; the app falls back to the browser voice when a file is missing.

## Stack (fixed — change only by explicit decision)

| Concern | Choice |
|---|---|
| Database, auth, file storage | Supabase (PostgreSQL), free tier |
| App | Next.js PWA on Vercel |
| Content pipeline | Python, run locally |
| Story text | DeepSeek (owner has a key); quality judged by owner review |
| Voice | Per target language in `pipeline/voices.yaml` (provider, model per emotion, tempo); swapping a voice is a config edit. German: Piper Thorsten, `thorsten-high` for neutral lines and `thorsten_emotional` for the rest. Rejected: Chatterbox (American accent, hallucinations), Gemini free tier (10 calls/day) |
| Images | SDXL base 1.0, local GPU (RTX 3080 8 GB, CPU offload). Gemini image is the paid alternative (needs credit) |
| Payments | Stripe (web sale, Stripe Tax on) — not before there are other users |

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
  `localize.py` makes the layer for every base language of a beta/live pair. `stories/<slug>.json` has a
  `localizations` block per base language.
- App: all pages under `app/[lang]/` (the base language); `proxy.ts` redirects. UI text only from
  `web/dictionaries/<lang>.json` through `useI18n()`; words the teacher says in the target language from `PHRASES`
  in `lib/speech.ts`. Story text keeps `dir="ltr"` so a right-to-left app works.
- Never hard-code Dutch (or any language) in new code or prompts.
