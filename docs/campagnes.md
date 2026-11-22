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

### Korte videocodes

In een TikTok-bijschrift of de beschrijving van een YouTube Short kun je niet op een link klikken. Daarom toont
elke video een kort adres dat de kijker overtypt: `qissio.com/v/c05`. Dat stuurt door naar bijvoorbeeld
`/almanya?utm_source=video&utm_campaign=c05`, zodat de video in de funnel een eigen rij krijgt (bron `video`,
campagne = de code). De code mag bestaan uit kleine letters, cijfers en streepjes (hoofdletters worden klein
gemaakt). Dit werkt voor elke editie op dezelfde manier: niets hiervan hoort bij één taalpaar.

**Per code één regel** in `web/lib/video-codes.json`: voor welke editie (en track) de video gemaakt is en wat hij
liet zien.

    "c05": {"edition": "almanya"}                                         alleen de editie: de gewone blokken
    "a02": {"edition": "almanya", "story": "buergeramt-nacht"}            een verhaalvideo: dat verhaal
    "quiz-dokter": {"edition": "almanya", "start": "phrases", "topic": "health"}   zinnen van één onderwerp eerst
    "b1-b08": {"edition": "almanya", "track": "b1-examen", "start": "phrases", "topic": "office"}
    "nl-a01": {"edition": "duits", "story": "…"}                          een video voor Nederlandstaligen

Zet bij elke nieuwe video (en elke code in een bio) een regel erbij en push. Een code zonder regel werkt ook: hij
gaat, net als qissio.com zelf, naar de editie in de taal van de telefoon van de bezoeker, en telt wel als campagne.
Onderwerpen: health, work, office, shopping, housing, travel, social, everyday (`pipeline/phrases.py`, TOPICS; elke
zin heeft er één of twee, `storylingo.py phrase-topics <taal>`).

De doorverwijzing zet het in het adres (`&story=…`, `&start=phrases`, `&topic=…`) en de welkomstpagina toont dan:

- bij een verhaalvideo het blok "Het verhaal uit de video" met de titel van dat verhaal, en het niveau van dat
  verhaal alvast gekozen (kiest de bezoeker een ander niveau, dan krijgt hij het eerste verhaal van dat niveau);
- bij een zinnenvideo het zinnenblok bovenaan, met een onderwerp als "Handige zinnen: bij de dokter", dat naar de
  zinnen van dat onderwerp gaat (`/<editie>/phrases?topic=health`). Zonder Plus zijn per niveau de eerste 5 van
  elk onderwerp open (`phrases_per_topic`, docs/plus.md): genoeg om te proeven, de rest is Plus;
- bij een code met alleen een editie (zoals de fout/goed-video's) de gewone blokken.

Het bezoek wordt in alle gevallen gewoon geteld: de bezoeker komt altijd eerst op de welkomstpagina. Wie al eerder
begonnen is, ziet geen welkomstpagina meer maar zijn startscherm.

De klikbare link in je bio meet per platform: `qissio.com/almanya?utm_source=tiktok&utm_campaign=bio` en
hetzelfde met `youtube`.

### Welke editie zonder editie in het adres

Een adres met een editie (`/almanya`, een videocode met een regel) gaat altijd daarheen. Alleen `qissio.com` zelf
en een videocode zonder regel moeten raden (`web/proxy.ts`, guessEdition), voor elke editie op dezelfde manier:

1. **De laatste editie in deze browser.** Wie een editie opent, krijgt het cookie `qissio_edition` (alleen de naam
   van de editie, een jaar geldig: een voorkeur, geen tracking). Wie terugkomt, komt bij zijn eigen voortgang.
2. **De taal van de browser**, maar Engels telt zwak: in een land met een eigen basistaal (Nederland, België,
   Marokko, Syrië …, de lijst COUNTRY_BASE) wint het land, want daar hebben veel mensen Engelse Windows of een
   Engelse telefoon. Het land geeft Vercel mee; het wordt niet opgeslagen.
3. Anders de Engelse editie.

Een verkeerde gok is met één tik recht te zetten: onderaan de welkomstpagina staat "Niet jouw taal?" met dezelfde
doeltaal in de andere basistalen (in hun eigen taal genoemd). De campagne in het adres gaat mee. De bezoeker telt
dan in beide edities als bezoek, met dezelfde campagne. Laptop en telefoon zijn twee aparte bezoekers zolang
iemand niet inlogt.

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
| plus | opende een productpagina (Plus), zonder het al te hebben |
| to pay | klikte op betalen en ging naar Stripe |
| paid | betaalde via Stripe in deze editie (ook als het abonnement later is opgezegd) |

Wie direct via een advertentie op de Plus-pagina landt (`/almanya/p/plus-de?utm_campaign=…`), telt ook mee: die
pagina onthoudt de campagne net als de welkomstpagina. Betalen kan alleen met een account; wie daarvoor inlogt op
een account van een ander apparaat, telt bij "to pay" en "paid" zonder campagne.

Zet in advertenties altijd het volledige adres (`qissio.com/almanya`), nooit alleen `qissio.com`: de voorpagina kiest
de editie op de taal van de telefoon, en een Arabischtalige met een Nederlandse telefoon komt dan bij /duits uit.

De verhoudingen tussen die kolommen vertellen meer dan de aantallen. Veel bezoekers maar weinig starters betekent
dat de pagina niet past bij de advertentie. Veel starters maar weinig "week+" betekent dat de inhoud niet aansluit
bij de niche. De wachtlijst laat zien welke betaalde cursus de moeite waard is om te bouwen.

Gebruik voor campagnenamen kleine letters en streepjes; de app maakt alles klein en knipt na 100 tekens af.
