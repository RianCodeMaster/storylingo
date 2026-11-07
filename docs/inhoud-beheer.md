# Inhoud beheren: ontwerp

Hoe StoryLingo zo is ingericht dat edities, talen, verhalen en vragen makkelijk toe te voegen en aan te passen zijn,
door Claude, door een ander LLM of door jou met een paar wijzigingen in een bestand. Er komt geen beheerscherm.

## Het idee in één alinea

**Alle inhoud staat als leesbare bestanden in `content/`, in git. De database is een kopie.** Eén commando, `sync`,
maakt de database gelijk aan de bestanden: wat veranderd is wordt bijgewerkt, op zijn plek, zonder dat de voortgang
van leerlingen verloren gaat. `media` maakt daarna alleen de beelden en geluiden die ontbreken of verouderd zijn.
`check` controleert of alles klopt. Zo kan een LLM alles lezen en aanpassen (het zijn gewone bestanden), zie je in
git precies wat er veranderd is, en kun je elke wijziging terugdraaien.

## Waarom dit, en niet een beheerscherm of de database zelf

- **Een LLM werkt het best met bestanden.** Claude kan een heel verhaal lezen, een vraag verbeteren, een editie kopiëren
  en een taal toevoegen door bestanden te schrijven. In een database werken is blind en foutgevoelig.
- **Git is je vangnet.** Elke wijziging is zichtbaar als verschil, te bespreken en terug te draaien. Een database
  vergeet wat er vroeger stond.
- **Dupliceren is kopiëren.** Een nieuwe editie is een kopie van een bestand met vijf regels aangepast.
- **Een beheerscherm kost bouwtijd en onderhoud**, en jij gaat het niet gebruiken.

## Wat er nu misgaat (gevonden bij het onderzoek, 2026-11-07)

1. **Een gepubliceerd verhaal is niet aan te passen.** `load_story` weigert het; en een concept wordt bij `reload`
   weggegooid en opnieuw aangemaakt met nieuwe id's, wat de database blokkeert zodra iemand het gespeeld heeft
   (antwoorden en sessies verwijzen ernaar). "Even een vraag verbeteren" kan dus niet.
2. **Eén taal staat op elf plekken**: `prompts.py` (naam), `storylingo.py` (`FEEDBACK`), `speech.ts` (`PHRASES`,
   `LANG_TAGS`), `listen.ts` (getallen), `check.py` (meervoudsvormen), `locales.ts`, `dictionaries.ts`, `layout.tsx`
   (font), `voices.yaml` en twee migraties (`languages`, `language_pairs`). Een taal toevoegen is elf bestanden
   aanraken en hopen dat je er geen vergeet.
3. **Audio weet niet bij welke tekst het hoort.** Pas je een vraag aan, dan speelt de oude opname gewoon door.
   Wissel je de stem (ElevenLabs), dan moet je zelf weten wat er opnieuw moet.

## De nieuwe indeling

```
content/
├── languages/                     één bestand per taal: alles wat bij die taal hoort
│   ├── de.yaml                    doeltaal: stem, zinnen van de leraar, getallen voor de spraakherkenning, …
│   ├── es.yaml
│   ├── nl.yaml                    basistaal: naam, schrijfrichting, meervoudsvormen, schrift
│   ├── en.yaml
│   └── ar.yaml
├── editions/                      één bestand per niche
│   ├── neu-in-deutschland.yaml    ar → de, Arabischtaligen nieuw in Duitsland
│   └── …
└── stories/
    └── de/                        per doeltaal
        └── hamster-boerse/        één map per verhaal
            ├── story.yaml         brief, scènes, vragen, woordenlijst, stem per zin, kernwoorden (alleen Duits)
            ├── nl.yaml            alles wat een Nederlandstalige leest: vertaling, betekenissen, tips, gebaren
            ├── en.yaml
            └── ar.yaml
web/dictionaries/<code>.json       de knoppen en meldingen van de app (blijft waar het is: Next.js laadt het)
```

**Waarom YAML:** leesbaar voor mensen en LLM's, commentaar mogelijk, lange teksten zonder aanhalingstekens-gedoe,
en git toont per regel wat er veranderd is.

**Waarom een map per verhaal met een bestand per basistaal:** een basistaal toevoegen is bestanden toevoegen, het
verhaal zelf blijft onaangeraakt; en een vertaling nakijken (of door een moedertaalspreker laten nakijken) is één
bestand.

### Een taal: `content/languages/es.yaml`

```yaml
code: es
name: Español                # in de taal zelf (taalmenu)
english: Spanish             # voor de prompts
direction: ltr
script: latin                # bepaalt het font in de app
speech_tag: es-ES            # spraakherkenning en browserstem
plural_forms: [one, many, other]

# Alleen als doeltaal:
teacher:
  yes: ["¡Sí! ¡Exacto!", "¡Muy bien!", "¡Fantástico!", "¡Sí, sí, sí!"]
  no: ["¡No, no, no!", "¡Oh, no!"]
  next: Siguiente
  done: ¡Terminado!
recognition:                 # wat de herkenner anders schrijft dan het verhaal
  uno: "1"
  dos: "2"
  mil: "1000"
voice:                       # was voices.yaml; ElevenLabs = hier provider en stem veranderen
  provider: piper
  pause: 0.5
  styles:
    neutral: {model: es_ES-sharvard-medium, speaker: F, length_scale: 1.1}
    # alternatief: {model: es_ES-davefx-medium}
```

Daaruit volgt alles: de database (`languages`), de app (een gegenereerd `web/lib/languages.json` met zinnen van de
leraar, getallen, spraakcode, namen en richting), de prompts en de controle. **Eén bestand per taal, geen elf.**

### Een editie: `content/editions/neu-in-deutschland.yaml`

```yaml
slug: neu-in-deutschland
status: beta                  # draft / beta / live
base: ar
target: de
name: Deutsch mit Geschichten
tagline: قصص قصيرة ومضحكة للحياة اليومية في ألمانيا
colors: {primary: "#5DD39E", accent: "#F9C74F"}
domain: null                  # later: eigen domein
stories:                      # welke verhalen in deze editie
  tags: [alltag, behoerde, arbeit, algemeen]
  levels: [A2, B1]
price: null                   # later: Stripe
```

**Een editie dupliceren** = dit bestand kopiëren, `slug`, `base`, `name`, `tagline` en eventueel `tags` aanpassen,
`sync`. `check` vertelt dan wat er nog ontbreekt (bijvoorbeeld vertalingen in die basistaal) en welk commando dat
oplost. Taalparen worden afgeleid uit de edities: geen migraties meer voor inhoud.

### Een verhaal: `content/stories/de/hamster-boerse/story.yaml`

```yaml
slug: hamster-boerse
status: published             # draft / published
level: A2
tags: [algemeen, geld]
title: Hamster Hugo geht zur Börse
targets: [...]
core_words: [...]
scenes:
  - key: s1                   # vaste sleutel: blijft hetzelfde als je de tekst aanpast
    text: Hugo ist ein kleiner Hamster. …
    image_prompt: …
    questions:
      - key: s1q1
        prompt: Wollte Hugo reich sein?
        options: [Ja, Nein]
        answer: Ja
```

**De vaste sleutels zijn de kern.** `sync` herkent elke scène en vraag aan zijn sleutel, niet aan zijn tekst of plek.
Een vraag verbeteren houdt dezelfde sleutel, dus de antwoordgeschiedenis van leerlingen blijft eraan hangen. Een
nieuwe vraag krijgt een nieuwe sleutel (het pipeline-commando of Claude kiest die). Een verwijderde vraag die al
beantwoord is, wordt verborgen in plaats van gewist.

## De vier commando's

| Commando | Wat het doet |
|---|---|
| `storylingo.py sync` | Maakt de database gelijk aan `content/`: talen, edities, verhalen, vragen, vertalingen. Op zijn plek, voortgang blijft. Toont eerst wat er verandert. |
| `storylingo.py media [slug]` | Maakt alleen wat ontbreekt **of verouderd is**: elk geluid en beeld onthoudt van welke tekst (en welke stem) het gemaakt is. Vraag aangepast → alleen die vraag opnieuw. Stem gewisseld → alles van die taal opnieuw. |
| `storylingo.py localize …` | Vult vertalingen aan die ontbreken **of verouderd zijn**: elke vertaling onthoudt van welke brontekst ze komt. |
| `storylingo.py check` | Controleert alles: bestanden tegen hun schema, verhalen tegen talen, edities tegen verhalen en vertalingen, database tegen bestanden. Zegt per probleem welk commando het oplost. |

`generate` blijft: brief → DeepSeek → schrijft de map van een nieuw verhaal in `content/`. Daarna is het een gewoon
bestand dat je (of Claude) kunt nalezen en aanpassen.

## Recepten

Deze komen ook in `CLAUDE.md`, zodat elke Claude-sessie (en elk ander LLM dat de repo leest) ze volgt.

- **Vraag aanpassen of toevoegen:** `story.yaml` bewerken → `sync` → `media`. De vertalingen van die vraag bestaan
  niet (vragen zijn in de doeltaal), dus verder niets.
- **Scènetekst aanpassen:** `story.yaml` bewerken → `sync` → `localize` (alleen die scène, want de vertaling is nu
  verouderd) → `media` (alleen die scène) → `check`.
- **Nieuw verhaal:** brief schrijven (of Claude vragen) → `generate` → nalezen in `content/stories/…` → `status:
  published` → `sync` → `media` → `check`.
- **Nieuwe basistaal:** `content/languages/<code>.yaml` + `web/dictionaries/<code>.json` → `localize-all <code>` →
  `check`.
- **Nieuwe doeltaal:** `content/languages/<code>.yaml` met stem, zinnen van de leraar en getallen → `feedback <code>`
  → curriculum en briefs → verhalen.
- **Nieuwe editie:** een bestaande kopiëren en aanpassen → `sync` → `check`.
- **Stem wisselen (bijv. ElevenLabs):** `voice:` in het taalbestand aanpassen → `media` → alles van die taal wordt
  opnieuw ingesproken, omdat de stem in de vingerafdruk zit.

## Overstap

De vier huidige verhalen worden omgezet naar `content/stories/de/…`. Hun sleutels worden zo gekozen dat ze aansluiten
op de rijen die nu in de database staan, zodat je voortgang en die van het testaccount blijven. `pipeline/stories/` en
`pipeline/briefs/` verdwijnen; `voices.yaml`, `FEEDBACK`, `PHRASES`, `LANG_TAGS`, `WORDS` en `PLURAL_FORMS` gaan op
in de taalbestanden.

## Volgorde

1. ✅ Taalbestanden en de gegenereerde taalgegevens voor de app (lost de elf plekken op).
2. ✅ Verhalen als map met vaste sleutels, `sync` op zijn plek, overstap van de vier verhalen.
3. ✅ Vingerafdrukken voor media en vertalingen.
4. ✅ `check` uitbreiden naar alles.

Gebouwd op 2026-11-07. Wat tijdens het bouwen anders uitviel dan hierboven beschreven:

- **Nieuwe sleutels krijgen een willekeurig achtervoegsel** (`s1q7f3a`) zodra een scène al sleutels heeft. De eerste
  versie gaf de eerstvolgende vrije nummer; bij de proef nam een nieuwe vraag zo de sleutel `s1q3` van een
  verwijderde, al beantwoorde vraag over, en daarmee haar antwoorden. Alleen een gloednieuw verhaal krijgt nette
  nummers (`content.assign_keys`).
- **`check` vergelijkt database en bestanden met een proefrun van `sync`** in een transactie die wordt teruggedraaid;
  zo noemt hij precies wat een `sync` zou veranderen.
- **Briefs** staan in `content/briefs/<taal>/`; na `generate` staat de brief ook in `story.yaml`.
- **Bestanden heten naar hun sleutel** (`stories/<slug>/s2q3.wav`), niet naar hun plek, zodat herschikken ze niet
  verwisselt. Oudere bestanden (`scene-2.wav`) blijven gekoppeld tot ze een keer opnieuw gemaakt worden.
- **Gebaaruitleg en algemene woordbetekenissen** horen bij een concept of woord dat verhalen delen; de eerste
  vertaling blijft staan (een tweede verhaal overschrijft haar niet). Een gebaaruitleg verbeteren voor alle verhalen
  gaat daarom via de database, niet via één verhaalbestand. Doelstructuren en kernwoorden worden wél bijgewerkt.

Proef op het al gespeelde hamsterverhaal: een vraag aanpassen hield haar 5 antwoorden; een beantwoorde vraag
weghalen verborg haar met haar 4 antwoorden; een nieuwe vraag kreeg een nieuwe sleutel; terugzetten herstelde alles.
Een scène herschrijven liet `media` precies 2 bestanden maken en `localize` alleen die scène vertalen.
5. **Spaans** als eerste taal via deze route (stem: sharvard vrouw, Spaans uit Spanje).
6. **Edities** (bestanden + de app die per adres een editie toont) en **accounts**.
