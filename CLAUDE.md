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
├── supabase/migrations/   # SQL schema, one migration per change, never edit an applied migration
├── pipeline/              # (later) Python content pipeline
└── web/                   # (later) Next.js PWA
```

## Stack (fixed — change only by explicit decision)

| Concern | Choice |
|---|---|
| Database, auth, file storage | Supabase (PostgreSQL), free tier |
| App | Next.js PWA on Vercel |
| Content pipeline | Python, run locally |
| Story text | DeepSeek (owner has a key); quality judged by owner review |
| Voice | Steerable TTS (OpenAI gpt-4o-mini-tts or Gemini TTS); ElevenLabs only as a comparison |
| Images | Gemini image model for consistent characters; FLUX schnell for simple icons |
| Payments | Stripe (web sale, Stripe Tax on) — not before there are other users |

## Data model rules

- **Concept vs lexeme:** a `concept` is a language-neutral meaning and owns the gesture. A `lexeme` is how a
  language expresses it. A new language reuses all concepts and gestures.
- Content tables are written only by the pipeline (Supabase service role). The app reads published content.
- Row Level Security is on for **every** table. Users only see their own rows in learner tables.
- Generated files live in `assets` with provider, model and cost, so cost per story stays measurable.
- Secrets only in `.env` (git-ignored). Never put API keys in the web app.
