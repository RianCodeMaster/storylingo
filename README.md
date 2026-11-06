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
   Open http://localhost:3000. Je komt op de taal van je browser (`/nl` of `/en`); bovenaan de startpagina kies je
   een andere taal, en die keuze onthoudt de app. Op je telefoon (zelfde wifi): `http://<ip-van-je-pc>:3000`.

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
- Bij `generate` kiest DeepSeek ook de **kernwoorden**: zo'n 6 woorden die het verhaal dragen. In de app leer je
  ze vóór het verhaal (plaatje, stem, betekenis), daarna volgt een luisterspel en dan gaan ze je herhaling in.
  Opnieuw kiezen: `storylingo.py core <slug>`. De plaatjes tekent `media` (zie hieronder).
- Bij `generate` kiest DeepSeek ook per zin een emotie voor de verteller. Opnieuw: `storylingo.py voice <slug>`.
- Het verhaal zelf is alleen in de doeltaal. Vertaling, woordbetekenissen en gebaaruitleg komen per basistaal
  (`localize`). `generate` doet dat vanzelf voor elke basistaal met een paar op `beta` of `live`. Met de hand:
  `storylingo.py localize <slug> <basistaal>`, of voor alle verhalen `storylingo.py localize-all <basistaal>`.
  Zie [docs/meertaligheid.md](docs/meertaligheid.md).
- **Beelden en stem, gratis op je eigen laptop.** Start eerst de lokale generator in een apart venster (in `pipeline`):
  ```bash
  .venv-local/Scripts/python localgen/server.py
  ```
  en dan `storylingo.py media <slug>`. Eerst alle beelden (SDXL op je GPU, ~30 s per stuk), daarna alle audio
  (Piper: Thorsten, Duitse moedertaalspreker, met de emotie per zin; een paar seconden voor het hele verhaal).
- **Stem per taal:** `pipeline/voices.yaml`. Daar staat welk model welke emotie spreekt, het tempo en de pauzes.
  Andere stem (of later ElevenLabs)? Pas dat bestand aan en spreek alles opnieuw in (zie de uitleg bovenin het bestand).
  Afgebroken? Draai het opnieuw: het maakt alleen wat nog ontbreekt.
  Weghalen: `storylingo.py media-clear <slug> [images|audio]`. Zonder audio gebruikt de app de browserstem.
- Eerste keer `.venv-local` opzetten: zie `pipeline/localgen/requirements.txt` (Python 3.11, PyTorch met CUDA, ~8 GB downloads).
- Betaald alternatief: `storylingo.py media <slug> gemini` met `GEMINI_API_KEY` en tegoed in `pipeline/.env`.

## In de les

- **Circling past zich aan:** twee snelle, goede antwoorden over dezelfde structuur en de rest van die vragen
  wordt overgeslagen; een fout antwoord komt aan het eind van de scène nog één keer terug.
- **Hardop antwoorden:** onder elke vraag staat 🎤 *Zeg het*. Zet je *Elke vraag hardop* aan, dan gaat de microfoon
  vanzelf open zodra de vraag gesteld is. De spraakherkenning van de browser (gratis, geen AI) hoeft alleen te bepalen
  welk van de bekende antwoorden je zei: "Käfig" of "in einem Käfig" zijn allebei goed. Werkt in Chrome, Edge en
  Safari, niet in Firefox. De microfoon mag alleen op `localhost` of via https, dus op je telefoon via
  `http://<ip>:3000` zie je de knop niet (wel zodra de app online staat).
- Na een goed antwoord gaat de les vanzelf door. De reacties ("Ja! Genau!", "Nein, nein, nein!") spreekt Thorsten
  één keer per taal in: `storylingo.py feedback de`.

## Handig

- Database bekijken: Supabase Studio op http://127.0.0.1:54323
- Eerste keer Python opzetten (in `pipeline`): `py -3.14 -m venv .venv` en `.venv/Scripts/python -m pip install -r requirements.txt`
- `DEEPSEEK_API_KEY` moet als omgevingsvariabele gezet zijn (zie `pipeline/.env.example`).

## Meer talen

Ontwerp en stappenplan voor nieuwe basis- en doeltalen: [docs/meertaligheid.md](docs/meertaligheid.md).
