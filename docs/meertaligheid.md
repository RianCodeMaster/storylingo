# Meertaligheid: ontwerp en stappenplan

> Status: **ontwerp, nog niet gebouwd** (2026-11-03). Vandaag kan de app één taalpaar: Nederlands → Duits.

## Het idee in één alinea

Er zijn altijd twee talen in het spel: de **basistaal** (de taal van de app, de vertalingen en de uitleg) en de
**doeltaal** (de taal van de verhalen). Het belangrijkste besluit is dat die twee in de database **los van elkaar**
staan. Een verhaal hoort bij één doeltaal; de vertalingen erbij horen bij een basistaal. Waarom? Omdat het dure deel
van een verhaal — schrijven, nalezen, vijf beelden, alle audio — alleen van de doeltaal afhangt. Een Spaans verhaal
over een dansende koe is voor een Nederlander, een Duitser en een Arabier precies hetzelfde verhaal, met dezelfde
plaatjes en dezelfde stem. Alleen de laag eromheen verschilt: de vertaling, de betekenis van elk woord, de uitleg van
de gebaren. Die laag is tekst, kost een paar cent per verhaal en is in een minuut gemaakt. Zo maak je elk verhaal één
keer en verkoop je het aan iedere basistaal die die doeltaal wil leren.

## De gewenste taalparen

| Basistaal → doeltaal | Doeltaal-content (duur) | Basislaag (goedkoop) |
|---|---|---|
| Nederlands → Duits | ✅ bestaat | ✅ bestaat |
| Engels → Duits | ✅ bestaat | Engelse laag + Engelse app |
| Arabisch → Duits | ✅ bestaat | Arabische laag + Arabische app (RTL) |
| Nederlands → Spaans | Spaanse verhalen + stem | Nederlandse laag |
| Duits → Spaans | dezelfde Spaanse verhalen | Duitse laag + Duitse app |
| Arabisch → Spaans | dezelfde Spaanse verhalen | Arabische laag |
| Arabisch → Engels | Engelse verhalen + stem | Arabische laag |
| later: … → Frans | Franse verhalen + stem | per basistaal |

Doeltalen: **Duits, Spaans, Engels** (later Frans). Basistalen: **Nederlands, Engels, Arabisch, Duits**.
Zeven paren, maar maar drie keer "verhalen maken".

## Wat er nu aan één taal vastzit

Bij het bouwen is al rekening gehouden met meer talen (`languages`, `lexemes.language_code`, `stories.language_code`,
`profiles.native_language_code`, `user_languages`, concepten met Engelse sleutels, gebaren per concept). Maar een
paar dingen zijn nog stilzwijgend Nederlands:

| Waar | Nu | Probleem |
|---|---|---|
| `scenes.translation` | één vertaling (NL) | per basistaal nodig |
| `scenes.glossary` | woord + lemma + **betekenis (NL)** | woord hoort bij doeltaal, betekenis bij basistaal |
| `lexemes.gloss` | betekenis van een doelstructuur (NL) | per basistaal; voor een Arabier is "obwohl" iets anders uitleggen dan voor een Nederlander |
| `gestures.description` | gebaaruitleg (NL) | per basistaal |
| `stories.summary` | samenvatting | per basistaal |
| app-teksten | hard in de code ("Betekenis", "Vragen →") | woordenboek per basistaal |
| `<html lang="nl">` | vast | per basistaal, en `dir="rtl"` voor Arabisch |
| brief `learner_language` | het verhaal wordt in één keer mét NL-vertaling gemaakt | eerst doeltaal, daarna vertalen per basistaal |
| startscherm | toont alle verhalen | alleen verhalen in je doeltaal met een laag in je basistaal |

Wat **al** goed staat: de stem is per doeltaal instelbaar (`pipeline/voices.yaml`), audio en beelden horen bij het
verhaal en niet bij de basistaal, en herhaling (`user_lexeme_state`, `reviews`) hangt aan woorden van de doeltaal.

## Het nieuwe datamodel (gepland)

Twee lagen. De **doeltaallaag** blijft zoals hij is (stories, scenes, questions, lexemes, assets). Eén ding verhuist:
de betekenis gaat uit `scenes.glossary`, zodat daar alleen woord, lemma, niveau en `lexeme_id` blijven.

De **basistaallaag** komt erbij. Elke tabel heeft `base_language` in de sleutel:

```sql
-- Welke talen wat kunnen
alter table languages
  add column direction  text    not null default 'ltr' check (direction in ('ltr', 'rtl')),
  add column is_base    boolean not null default false,  -- kan app-taal zijn
  add column is_target  boolean not null default false;  -- heeft verhalen en een stem

-- Wat je verkoopt: alleen paren met status 'live' zijn zichtbaar voor klanten
create table language_pairs (
  base_language   text not null references languages (code),
  target_language text not null references languages (code),
  status          text not null default 'planned' check (status in ('planned', 'beta', 'live')),
  primary key (base_language, target_language)
);

create table story_localizations (
  story_id      uuid not null references stories (id) on delete cascade,
  base_language text not null references languages (code),
  summary       text,
  primary key (story_id, base_language)
);

create table scene_localizations (
  scene_id      uuid not null references scenes (id) on delete cascade,
  base_language text not null references languages (code),
  translation   text not null,
  glosses       jsonb not null default '{}',  -- { "<lexeme_id>": "betekenis in deze zin" }
  primary key (scene_id, base_language)
);

create table lexeme_glosses (       -- vervangt lexemes.gloss
  lexeme_id     uuid not null references lexemes (id) on delete cascade,
  base_language text not null references languages (code),
  gloss         text not null,
  note          text,                -- uitleg die past bij deze basistaal ("werkwoord achteraan, net als 'hoewel'")
  primary key (lexeme_id, base_language)
);

create table gesture_localizations (  -- vervangt gestures.description
  gesture_id    uuid not null references gestures (id) on delete cascade,
  base_language text not null references languages (code),
  description   text not null,
  primary key (gesture_id, base_language)
);
```

Alles krijgt RLS zoals de rest: iedereen mag lezen wat bij een gepubliceerd verhaal hoort. Een verhaal is zichtbaar
voor een leerling als het gepubliceerd is, in de doeltaal van die leerling is, en een `story_localizations`-rij in diens basistaal
heeft. De bestaande Nederlandse teksten gaan in de migratie naar rijen met `base_language = 'nl'`, dus er gaat niets
verloren.

De leerling: `profiles.native_language_code` wordt de basistaal (aan te passen in instellingen), `user_languages` is
wat iemand leert. Iemand kan dus later Nederlands → Duits én Nederlands → Spaans doen, met eigen voortgang per woord.

## De app (gepland)

Next.js heeft hier een standaardpatroon voor (zie `web/node_modules/next/dist/docs/01-app/02-guides/internationalization.md`):
alle pagina's onder `app/[lang]/`, een `proxy.ts` die bij het eerste bezoek de taal van de browser kiest
(`/nl/…`, `/en/…`, `/ar/…`), en per basistaal een woordenboek `web/dictionaries/<code>.json` met alle teksten van de
app. Dat geeft meteen vindbare pagina's per taal voor de verkoop.

Arabisch vraagt drie extra dingen. `<html dir="rtl">` en CSS met logische eigenschappen (`margin-inline-start` in plaats
van `margin-left`), zodat de lay-out vanzelf spiegelt. Een lettertype met Arabisch schrift (bijvoorbeeld
IBM Plex Sans Arabic). En gemengde richting: het Duitse of Spaanse verhaal blijft links-naar-rechts binnen een
rechts-naar-links app, dus verhaaltekst krijgt `dir="ltr"` en vertalingen `dir="auto"`. Arabisch is in jouw lijst
alleen basistaal, nooit doeltaal; dat scheelt veel (geen Arabische spraak, geen klinkertekens, geen woordsplitsing).

## De pipeline (gepland)

```
storylingo.py generate briefs/<naam>.yaml     verhaal in de doeltaal (+ emoties), zonder vertaling
storylingo.py localize <slug> <basistaal>     vertaling, woordbetekenissen, gebaren, samenvatting voor één basistaal
storylingo.py localize-all <basistaal>        alle gepubliceerde verhalen van de paren met die basistaal
```

`generate` vertaalt meteen naar alle basistalen die een paar hebben met die doeltaal. `localize` geeft DeepSeek de
basistaal mee, zodat de uitleg past bij wie leert: een Nederlander hoort dat "obwohl" werkt als "hoewel", een
Arabier krijgt een andere vergelijking. De brief krijgt geen `learner_language` meer.

## Stappenplan

### Stap 0 — Eenmalig: het datamodel ombouwen

Doe dit **voordat** er veel meer verhalen bijkomen: dan blijft de migratie klein en kun je het makkelijk testen.

1. Migratie schrijven met de nieuwe tabellen, en de bestaande NL-teksten erin overzetten (`base_language = 'nl'`).
2. Pipeline: `generate` zonder vertaling, nieuw commando `localize`. `pipeline/stories/*.json` krijgt per basistaal
   een eigen blok.
3. App: verhalen en woordenlijsten ophalen uit de basislaag, pagina's onder `app/[lang]/`, teksten in
   `dictionaries/nl.json`.
4. Testen: alles moet er precies hetzelfde uitzien als nu. Pas dan de oude kolommen weghalen.

Daarna is er twee soorten werk, en een taalpaar is altijd een combinatie van die twee.

### Een nieuwe **basistaal** toevoegen (bijv. Engels, Arabisch, Duits)

Goedkoop: geen stem, geen beelden, alleen tekst.

1. Rij in `languages` met `is_base = true` (en `direction = 'rtl'` voor Arabisch).
2. Woordenboek `web/dictionaries/<code>.json`: kopieer `nl.json`, laat DeepSeek of Claude een eerste vertaling maken,
   en laat een moedertaalspreker het nalezen. Dit is je verkooppraat; fouten kosten klanten.
3. Rij in `language_pairs` met status `planned` voor elk paar dat je wilt.
4. `storylingo.py localize-all <code>`: alle bestaande verhalen krijgen een laag in die taal.
5. Steekproef nalezen: een paar verhalen, vooral de uitleg bij de doelstructuren.
6. Zelf testen als leerling met die basistaal (bij Arabisch ook: spiegelt alles goed, is de tekst leesbaar).
7. Paar op `beta` (alleen voor jou of testers), daarna op `live`.
8. Verkooppagina, prijs en juridische teksten (voorwaarden, privacy) in die taal.

### Een nieuwe **doeltaal** toevoegen (bijv. Spaans, Engels, Frans)

Duurder: hier zit het echte werk.

1. **Stem kiezen.** Voeg een blok toe in `pipeline/voices.yaml`, download de stem, maak testclips en luister.
   Let op: alleen de Duitse Piper-stem heeft emoties. Voor Spaans en Engels moet je kiezen tussen een vlakke
   gratis stem en een betaalde dienst met emotie (bijv. ElevenLabs); de pipeline is daar al op voorbereid
   (één klasse in `media.py`, één regel in `voices.yaml`).
2. **Feedbackzinnen** ("¡Sí! ¡Exacto!") toevoegen in `FEEDBACK` in `storylingo.py`, dan `storylingo.py feedback <code>`.
3. **Taal in de pipeline**: naam in `LANGUAGE_NAMES` (`prompts.py`), en controleer of DeepSeek goed schrijft in die
   taal. Bij Duits maakte het fouten ("der beste Hacker" voor een vrouw), dus elke doeltaal heeft een moedertaalcheck nodig.
4. **Curriculum**: per niveau (A1–B2) de doelstructuren van die taal op een rij. Daaruit maak je de briefs.
5. **Startvoorraad**: zo'n 15 verhalen genereren, nalezen, beelden en audio maken, publiceren.
6. **Lokaliseren** naar alle basistalen waarvoor je een paar wilt (`generate` doet dit voortaan vanzelf).
7. Rij in `languages` met `is_target = true`, paren op `beta`, zelf testen, daarna `live`.

### Een nieuw **paar** van twee talen die er al zijn

Bijvoorbeeld Arabisch → Spaans als Arabisch en Spaans er allebei al zijn: een rij in `language_pairs`,
`localize-all`, nalezen, `live`. Een uur werk.

## Aanbevolen volgorde

1. **Stap 0** (datamodel). Zonder dit is elke nieuwe taal dubbel werk.
2. **Engels → Duits.** Alleen een basislaag op verhalen die er al zijn. Dit test het hele ontwerp met de minste
   moeite, en Engelstaligen zijn de grootste groep Duits-leerders.
3. **Spaans als doeltaal**, met Nederlands → Spaans eerst (jij kunt het zelf testen), daarna Duits → Spaans.
4. **Arabisch als basistaal** (RTL, lettertype, nalezen door een moedertaalspreker). Arabisch → Duits en
   Arabisch → Spaans komen dan bijna gratis mee.
5. **Engels als doeltaal** voor Arabisch → Engels. Grote markt, maar ook de drukste concurrentie.
6. Later Frans, en daarna andere veel gesproken talen, met hetzelfde stappenplan.

## Open beslissingen (voor later)

- Eén abonnement voor alle paren, of per doeltaal?
- Welke Arabische variant voor de app: Modern Standaard Arabisch ligt voor de hand.
- Betaalde stem (ElevenLabs) per doeltaal, of eerst gratis en vlak? Dat hangt van de cijfers na de testperiode af.
