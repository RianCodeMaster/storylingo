# Gevonden worden: de openbare pagina's

## Het idee

De app zelf (een verhaal spelen, woorden herhalen, je account) draait in de browser en is per leerling anders. Een
zoekmachine heeft daar niets aan. Daarom heeft elke editie daarnaast **openbare pagina's**: vaste HTML die op de
server gemaakt wordt, met echte tekst, en die maar één ding wil: dat je op "Begin gratis" drukt.

Elk verhaal krijgt zo een eigen pagina **per basistaal**. Hetzelfde Duitse verhaal staat dus in het Arabisch (almanya),
het Nederlands (duits) en het Engels (german) op het web: drie pagina's, drie zoekpublieken. Met de 36 verhalen van nu
zijn dat ruim 90 verhaalpagina's, en elk nieuw verhaal komt er vanzelf bij.

## De pagina's

| adres | wat | voor zoekopdrachten als |
|---|---|---|
| `/<editie>` en `/<editie>/<track>` | de app zelf, met onderaan links naar de niveaus | "Duits leren app" |
| `/<editie>/read` | alle verhalen per niveau | "Duitse verhalen met vertaling" |
| `/<editie>/level/a1` … | wat het niveau betekent, en zijn verhalen | "Duits A1 verhalen" |
| `/<editie>/read/<slug>` | één verhaal: samenvatting, woorden, alle scènes met vertaling | de titel, het onderwerp |
| `/sitemap.xml`, `/robots.txt` | de lijst voor zoekmachines | — |

Een **gratis** verhaal laat de hele tekst zien, met de vertaling eronder. Dat is echte inhoud waarop Google kan
ranken, en een voorproef. Het voordeel van de app (audio, gebaren, vragen, herhalen) blijft. Een **Plus**-verhaal
toont alleen titel, plaatje en samenvatting, met de knop naar Plus. Wat openbaar is, beslist de database: de pagina's
halen alles op met de openbare sleutel, net als een bezoeker zonder account (`web/lib/catalog.ts`).

De schermen van de app zelf zeggen `noindex`, zodat zoekmachines die niet als losse pagina's tonen.

## Wat zoekmachines extra krijgen

- **titel en beschrijving** per pagina, in de basistaal (teksten in `web/dictionaries/<taal>.json`, onder `seo`);
- **canonical**: het ene juiste adres van elke pagina;
- **hreflang**: "dit verhaal bestaat ook in het Nederlands en Engels", zodat elke zoeker de versie in zijn eigen taal
  krijgt;
- **gestructureerde data** (JSON-LD): een verhaal is een `LearningResource` met niveau, taal, woorden en gratis/betaald,
  plus een kruimelpad;
- **deelplaatje**: het eerste plaatje van het verhaal, zodat een gedeelde link in WhatsApp of Facebook er goed uitziet.

## Bijwerken

Niets met de hand. De pagina's worden bij elke build gemaakt en daarna elk uur ververst. Een nieuw verhaal staat er na
`sync --cloud` dus binnen een uur, ook zonder nieuwe deploy.

Het domein: zonder instelling gebruikt de site Vercels eigen productieadres. Met een eigen domein zet je in Vercel
`NEXT_PUBLIC_SITE_URL=https://jouwdomein` en deploy je opnieuw. Meld daarna de sitemap aan bij Google Search Console
(`https://jouwdomein/sitemap.xml`).
