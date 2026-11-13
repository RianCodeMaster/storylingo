# Plus en het gratis deel

## Het idee

Een gratis gebruiker leert elke dag een beetje, en loopt elke dag tegen een grens aan. Zoals bij Duolingo beperken we
vooral **hoe vaak** je mag leren, en maar een deel van **wat** je mag zien. Met 4 verhalen per niveau zou een slot op
bijna alles betekenen dat iemand in een kwartier klaar is en vertrekt. Met een daglimiet komt hij terug, bouwt hij
een gewoonte op, en ziet hij elke dag op het juiste moment de weg naar Plus.

## Wat is gratis

Per doeltaal staat het in het Plus-product (`content/products/plus-de.yaml`, `plus-nl.yaml`, `plus-es.yaml`):

```yaml
free:
  stories_per_level: 2     # per niveau de eerste 2 verhalen
  stories_per_day: 1       # waarvan 1 nieuw verhaal per dag; een verhaal opnieuw spelen mag altijd
  phrases_per_level: 30    # per niveau de eerste 30 zinnen
  phrases_per_day: 10      # waarvan 10 nieuwe per dag
  reviews_per_day: 20      # 20 woorden herhalen per dag
```

Een getal aanpassen en daarna `storylingo.py sync` (en `sync <een verhaal> --cloud` voor online). Welke verhalen gratis
zijn, rekent sync uit: per taal en niveau de eerste, in de volgorde waarin de app ze toont. Een nieuw verhaal komt
dus achteraan, en valt in Plus zodra er al genoeg gratis zijn.

Plus kost nu €8,49 per maand of €47 per jaar, inclusief btw (`prices` in hetzelfde bestand). Eén Plus geldt voor alle edities van
die taal (Plus Duits voor almanya, duits en german). Pakketten zoals de DTZ-training staan daar los van.

Een taal zonder Plus-product (of met een Plus op `draft`) heeft geen limieten.

## Wie bewaakt wat

| | bewaakt door |
|---|---|
| Plus-verhalen en zinnen na de eerste 30 lezen | de database (leesregels op `stories` en `phrases`, `has_plus()`) |
| 1 nieuw verhaal per dag | de database weigert een tweede nieuwe sessie (`may_start_story()`), en de app toont het vooraf |
| 10 nieuwe zinnen en 20 herhalingen per dag | de app |

Van een dicht verhaal mag iedereen alleen titel, samenvatting en plaatje zien (view `story_cards`), zodat de app er
een slotje bij kan zetten. "Vandaag" begint om middernacht Midden-Europese tijd.

## De momenten

De weg naar Plus is er altijd, maar groot alleen op het juiste moment:

- **altijd, klein**: het ⭐ Plus-label bovenaan het startscherm, de Plus-tegel met de prijs, en een slotje bij elk
  dicht verhaal in de lijst;
- **groot, op het moment zelf**: als het nieuwe verhaal van vandaag erop zit (op het startscherm en bij het openen
  van een nieuw verhaal), als de gratis verhalen van een niveau op zijn, als de 10 zinnen of 20 herhalingen van
  vandaag erop zitten, en als de gratis zinnen van een niveau geleerd zijn;
- **klein, na een succes**: onder de score van een afgemaakt verhaal;
- **nooit** op de welkomstpagina: wie nog niets geprobeerd heeft, schrikt van een prijs.

Elke knop leidt naar `/<editie>/p/plus-<taal>`: wat je krijgt, de maand- en jaarprijs, en zolang Stripe er nog niet
is een e-mailveld (de wachtlijst is dan je lijst van mensen die willen betalen).

Iemand Plus geven met de hand: `storylingo.py grant <e-mail> plus-de` (of met een aantal dagen erachter als proef).
