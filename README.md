# Qissio

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
   Open http://localhost:3000: het overzicht van alle **edities**. Elke editie heeft een eigen adres (`/duits`,
   `/almanya`, `/spaans` …) met een eigen welkomstpagina, taal en kleur; marketing linkt alleen naar dat adres. Op je telefoon (zelfde wifi): `http://<ip-van-je-pc>:3000`.

Stoppen: `npx supabase@3.0.0 stop` (je data blijft bewaard).

## Waar alles staat

Alle inhoud staat als leesbare bestanden in **`content/`**; de database is een kopie. Hoe en waarom:
[docs/inhoud-beheer.md](docs/inhoud-beheer.md).

```
content/languages/<code>.yaml          alles van één taal: naam, richting, stem, zinnen van de leraar, getallen
content/editions/<slug>.yaml           één niche: basistaal, doeltaal, naam, slogan, intro, kleur, welke verhalen
content/briefs/<taal>/<slug>.yaml      de opdracht voor een nieuw verhaal
content/stories/<taal>/<slug>/         één verhaal: story.yaml (verhaal + vragen) en <basistaal>.yaml (vertalingen)
web/dictionaries/<code>.json           de knoppen en meldingen van de app
```

Na elke wijziging in `content/` (in `pipeline`):

```bash
.venv/Scripts/python storylingo.py sync
```

`sync` zet de database gelijk aan de bestanden, op zijn plek: de voortgang van leerlingen blijft. Daarna zegt
`storylingo.py check` of alles compleet is, en per probleem welk commando het oplost (bijvoorbeeld `media` voor
een opname die niet meer bij zijn tekst past, of `localize` voor een vertaling van een herschreven scène).

## Niveaus

Elk verhaal heeft een niveau (A1–C2). `content/curriculum/<taal>.yaml` zegt welke structuren bij welk niveau horen;
`check` bewaakt dat elk verhaal daarbij past. In de app kiest een nieuwe leerling bij de start hoe goed hij de taal al
kent, ziet hij daarna zijn niveau en zijn volgende verhaal, en stelt de app het volgende niveau voor als hij klaar is.

## Zinnen

Naast de verhalen heeft elke editie een onderdeel **Zinnen**: per doeltaal de 200 meest gebruikte zinsdelen van A1,
A2 en B1 (`content/phrases/<taal>/A1.yaml` …), voor alle edities met die doeltaal hetzelfde. In de app leer je ze tien
tegelijk (horen, lezen, nazeggen, betekenis) met daarna een luistertoets; daarna komen ze terug in de herhaling, naast
de woorden uit de verhalen.

```bash
.venv/Scripts/python storylingo.py phrases de A2            # DeepSeek vult het niveau aan tot 200
.venv/Scripts/python storylingo.py localize-phrases de nl   # betekenissen voor één basistaal
.venv/Scripts/python storylingo.py sync                     # in de database
.venv/Scripts/python storylingo.py media-phrases de         # inspreken (alleen wat ontbreekt of veranderd is)
```

Een zin aanpassen: in het niveaubestand de tekst wijzigen, `localize-phrases` (hij vertaalt alleen de nieuwe tekst),
`sync`, `media-phrases`. `check` bewaakt volle niveaus, geen dubbelingen, betekenissen en opnames.

## Een nieuw verhaal maken

1. Kopieer een brief in `content/briefs/de/` en pas thema, niveau, tags en doelstructuren aan.
2. In `pipeline`:
   ```bash
   .venv/Scripts/python storylingo.py generate ../content/briefs/de/<naam>.yaml
   ```
   DeepSeek schrijft het verhaal, het script controleert het (elke structuur minstens 3x, antwoorden kloppen),
   maakt woordenlijst, kernwoorden, emoties en vertalingen, en zet het als **concept** in `content/stories/de/<slug>/`
   en in de database.
3. Lees het (`storylingo.py show <slug>`). Iets aanpassen? Bewerk `story.yaml` en draai `sync`.
4. Beelden en stem: `storylingo.py media <slug>` (zie hieronder).
5. Tevreden: `storylingo.py publish <slug>` (zet `status: published` in het bestand en synchroniseert). Nu staat het in
   de app.

**Een vraag aanpassen, toevoegen of weghalen** in een verhaal dat al gespeeld is: bewerk `story.yaml`, dan `sync` en
`media`. Een vraag houdt zijn sleutel (`s2q3`), dus de antwoordgeschiedenis blijft eraan hangen. Een nieuwe vraag mag
zonder sleutel; `sync` geeft hem er een. Een weggehaalde vraag die al beantwoord is, wordt verborgen in plaats van
gewist.

`storylingo.py list` toont alle verhalen in de database en hun status.

## Woordenlijst, beelden en stem

- Bij `generate` maakt DeepSeek ook een woordenlijst: elk woord in de app is aan te tikken.
  Opnieuw (bijv. na het herschrijven van een scène): `storylingo.py glossary <slug>`.
- Bij `generate` kiest DeepSeek ook de **kernwoorden**: zo'n 6 woorden die het verhaal dragen. In de app leer je
  ze vóór het verhaal (plaatje, stem, betekenis), daarna volgt een luisterspel en dan gaan ze je herhaling in.
  Opnieuw kiezen: `storylingo.py core <slug>`. De plaatjes tekent `media` (zie hieronder).
- Bij `generate` kiest DeepSeek ook per zin een emotie voor de verteller. Opnieuw: `storylingo.py voice <slug>`.
- Het verhaal zelf is alleen in de doeltaal. Vertaling, woordbetekenissen en gebaaruitleg komen per basistaal
  (`localize`). `generate` doet dat vanzelf voor elke basistaal met een paar op `beta` of `live`. Met de hand:
  `storylingo.py localize <slug> <basistaal>`, of voor alle verhalen `storylingo.py localize-all <basistaal>`. Een
  bestaande vertaling wordt alleen aangevuld waar iets ontbreekt of verouderd is; helemaal opnieuw: verwijder eerst
  `<basistaal>.yaml`. Zie [docs/meertaligheid.md](docs/meertaligheid.md).
- **Beelden en stem, gratis op je eigen laptop.** Start eerst de lokale generator in een apart venster (in `pipeline`):
  ```bash
  .venv-local/Scripts/python localgen/server.py
  ```
  en dan `storylingo.py media <slug>`. Het maakt alleen wat **ontbreekt of verouderd is**: elk beeld en elke opname
  onthoudt van welke tekst en welke stem het gemaakt is. Vraag aangepast? Alleen die vraag. Afgebroken? Draai het
  opnieuw. Beelden met SDXL op je GPU (~30 s per stuk), audio met Piper (een paar seconden voor een heel verhaal).
- **Stem per taal:** het blok `voice:` in `content/languages/<code>.yaml` (model per emotie, tempo, pauzes; uitleg
  bovenin `de.yaml`). Andere stem (of later ElevenLabs)? Pas dat blok aan en draai `media` per verhaal: alles van die
  taal wordt opnieuw ingesproken, omdat de stem in de vingerafdruk zit.
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
- **Nazeggen (shadowing):** na de laatste vragen zeg je zo'n zes zinnen na: korte zinnen waarin de doelstructuren zitten.
  Je hoort de zin, neemt jezelf op (blijft in je browser, wordt nergens bewaard) en hoort daarna jezelf en de verteller
  vlak na elkaar. De spraakherkenning laat zien welke woorden duidelijk overkwamen. Overslaan mag; het verhaal telt
  al als uitgespeeld. Dit werkt omdat `media` bij elke vertelling de begin- en eindtijd per zin bewaart
  (`assets.marks`); oudere audio zonder tijden: `media-clear <slug> audio` en opnieuw `media <slug>`.
- Na een goed antwoord gaat de les vanzelf door. De reacties ("Ja! Genau!", "Nein, nein, nein!") staan onder
  `teacher:` in het taalbestand en worden één keer per taal ingesproken: `storylingo.py feedback de`.

## Handig

- Database bekijken: Supabase Studio op http://127.0.0.1:54323
- Eerste keer Python opzetten (in `pipeline`): `py -3.14 -m venv .venv` en `.venv/Scripts/python -m pip install -r requirements.txt`
- `DEEPSEEK_API_KEY` moet als omgevingsvariabele gezet zijn (zie `pipeline/.env.example`).

## Online (Supabase + Vercel)

Hoe de overstap gaat en wat jij en Claude ieder doen: [docs/cloud.md](docs/cloud.md). Daarna werkt elk commando ook
op de cloud met `--cloud` erachter (bijv. `storylingo.py sync --cloud`).

## Meer talen

Ontwerp en stappenplan voor nieuwe basis- en doeltalen: [docs/meertaligheid.md](docs/meertaligheid.md).
