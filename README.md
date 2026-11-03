# StoryLingo

Taal leren met absurde verhalen, gebaren en circling-vragen (TPRS). Fase 1 draait volledig lokaal.

## Opstarten

1. Start **Docker Desktop**.
2. Start de lokale database (in `C:\dev\storylingo`):
   ```bash
   npx supabase@3.0.0 start -x realtime,edge-runtime,logflare,vector,imgproxy,supavisor
   ```
3. Start de app (in `web`):
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
   Open http://localhost:3000. Op je telefoon (zelfde wifi): `http://<ip-van-je-pc>:3000`.

Stoppen: `npx supabase@3.0.0 stop` (je data blijft bewaard).

## Een nieuw verhaal maken

1. Kopieer een brief in `pipeline/briefs/` en pas thema en doelstructuren aan.
2. In `pipeline`:
   ```bash
   .venv/Scripts/python storylingo.py generate briefs/<naam>.yaml
   ```
   DeepSeek schrijft het verhaal, het script controleert het (elke structuur minstens 3x, antwoorden kloppen)
   en zet het als **concept** in de database. Het verhaal staat ook in `pipeline/stories/<slug>.json`.
3. Lees het. Iets aanpassen? Bewerk de JSON en draai `storylingo.py reload <slug>`.
4. Tevreden: `storylingo.py publish <slug>`. Nu staat het in de app.

`storylingo.py list` toont alle verhalen en hun status.

## Woordenlijst, beelden en stem

- Bij `generate` maakt DeepSeek ook een woordenlijst: elk woord in de app is aan te tikken.
  Voor een ouder verhaal: `storylingo.py glossary <slug>`.
- Bij `generate` kiest DeepSeek ook per zin een emotie voor de verteller. Opnieuw: `storylingo.py voice <slug>`.
- **Beelden en stem, gratis op je eigen laptop.** Start eerst de lokale generator in een apart venster (in `pipeline`):
  ```bash
  .venv-local/Scripts/python localgen/server.py
  ```
  en dan `storylingo.py media <slug>`. Eerst alle beelden (SDXL op je GPU, ~30 s per stuk), daarna alle audio
  (Piper: Thorsten, Duitse moedertaalspreker, met de emotie per zin; een paar seconden voor het hele verhaal).
  Afgebroken? Draai het opnieuw: het maakt alleen wat nog ontbreekt.
  Weghalen: `storylingo.py media-clear <slug> [images|audio]`. Zonder audio gebruikt de app de browserstem.
- Eerste keer `.venv-local` opzetten: zie `pipeline/localgen/requirements.txt` (Python 3.11, PyTorch met CUDA, ~8 GB downloads).
- Betaald alternatief: `storylingo.py media <slug> gemini` met `GEMINI_API_KEY` en tegoed in `pipeline/.env`.

## Handig

- Database bekijken: Supabase Studio op http://127.0.0.1:54323
- Eerste keer Python opzetten (in `pipeline`): `py -3.14 -m venv .venv` en `.venv/Scripts/python -m pip install -r requirements.txt`
- `DEEPSEEK_API_KEY` moet als omgevingsvariabele gezet zijn (zie `pipeline/.env.example`).
