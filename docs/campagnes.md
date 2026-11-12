# Campagnes en tracks

Je adverteert per niche: Syriërs die voor hun B1 of DTZ leren, Noord-Afrikanen die in Duitsland komen werken, en
algemene campagnes. Iedereen komt in dezelfde app, met dezelfde verhalen en dezelfde voortgang. Alleen de ingang
verschilt. Zo'n ingang heet een **track**.

## Een track

Een track staat in het editiebestand (`content/editions/almanya.yaml`, onder `tracks:`) en krijgt een eigen adres:
`/almanya/b1-examen`. Op dat adres ziet de bezoeker de welkomstpagina van de editie, maar met:

- **eigen kop en intro** (`tagline`, `intro`): de boodschap uit je advertentie komt terug op de pagina;
- **eigen titel en beschrijving voor Google** (`title`, `description`): de pagina kan gevonden worden op zoekwoorden
  van die niche, los van de algemene `/almanya`;
- **een startniveau** (`level`, mag leeg): wie via de examenadvertentie komt, staat al op B1 (kiezen blijft kunnen);
- **eigen verhalen eerst** (`prefer`: tags zoals `behoerde`, `werk`);
- **producten**: een product (docs/producten.md) met deze track in zijn `tracks:` staat op de welkomstpagina, zoals
  de DTZ-training: zolang die `coming` is, kan de bezoeker zijn e-mail achterlaten.

Na het starten onthoudt de app de track bij de leerling, zodat de verhalen van de track vooraan blijven staan.

Een nieuwe track toevoegen: kopieer er een in het editiebestand, pas de teksten aan (in de basistaal, dus Arabisch
voor almanya) en draai `storylingo.py sync` en `storylingo.py check`. Daarna moet de app opnieuw gedeployed worden
(push), want het adres bestaat pas na een nieuwe build.

## Campagnes meten

Hang aan elke advertentielink een campagne en een bron:

    https://<jouw-domein>/almanya/b1-examen?utm_campaign=syrie-b1&utm_source=tiktok
    https://<jouw-domein>/almanya/werken?utm_campaign=marokko-expats&utm_source=facebook
    https://<jouw-domein>/almanya?utm_campaign=algemeen-nov&utm_source=youtube

De app slaat bij het eerste bezoek de track, de campagne en de bron op, in je eigen database (tabellen `visits` en
`enrollments`). Er is geen tracker van buitenaf en dus geen cookiebanner nodig. Alleen de eerste aanraking telt:
wie eerst via een advertentie kwam en later direct `/almanya` opent, blijft bij die advertentie horen. Een gewoon
bezoek zonder campagne wordt wel ingevuld zodra iemand daarna via een advertentie komt.

Bekijk de resultaten met:

    python storylingo.py funnel --cloud          alle edities
    python storylingo.py funnel almanya --cloud  één editie

Per track en campagne zie je dan:

| kolom | betekent |
|---|---|
| came | bezocht de pagina |
| started | koos een niveau en begon |
| finished | maakte minstens één verhaal af |
| week+ | speelde nog een week na het eerste bezoek |
| waitlist | liet een e-mailadres achter voor een cursus |

De verhoudingen tussen die kolommen vertellen meer dan de aantallen. Veel bezoekers maar weinig starters betekent
dat de pagina niet past bij de advertentie. Veel starters maar weinig "week+" betekent dat de inhoud niet aansluit
bij de niche. De wachtlijst laat zien welke betaalde cursus de moeite waard is om te bouwen.

Gebruik voor campagnenamen kleine letters en streepjes; de app maakt alles klein en knipt na 100 tekens af.
