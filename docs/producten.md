# Producten

Een product is iets wat een leerling bovenop een editie kan krijgen: een verhalenpakket, later een examentraining.
Elk product is één bestand in `content/products/`. Een nieuw product toevoegen is dus een bestand kopiëren en
aanpassen, de inhoud maken en `sync` draaien. Code is alleen nodig voor een nieuwe **soort** product.

## Een product: `content/products/dtz-training.yaml`

```yaml
slug: dtz-training
status: coming            # draft (alleen jij) / coming (wachtlijst) / live (te koop)
kind: exam                # wat de app ermee doet, zie hieronder
editions: [almanya]       # waar het aangeboden wordt
tracks: [b1-examen]       # tracks waarvan de welkomstpagina het ook laat zien
visibility: everyone      # everyone: een tegel voor iedereen / owners: onzichtbaar tot iemand het heeft
price: {amount: 1900, currency: eur}            # in centen; interval: month of year voor een abonnement
tags: []                  # kind stories: de verhalen die erbij horen
texts:                    # per basistaal van de edities
  ar: {icon: 🎓, title: تدريب امتحان DTZ, text: ...}
```

Daarna: `storylingo.py sync` en `storylingo.py check`. Online pas na een push (de app bouwt de pagina's).

## Soorten

| soort | wat de app doet | klaar? |
|---|---|---|
| `stories` | de gepubliceerde verhalen met een van de `tags`, alleen voor wie het product heeft | ja |
| `phrases` | een extra zinnenpakket | nog niet: kan `draft` of `coming` zijn |
| `exam` | examentraining in examenvorm | nog niet: kan `draft` of `coming` zijn |

Een **verhalenpakket** maken: schrijf briefs met een eigen tag (bijvoorbeeld `tags: [dtz]`), genereer, lees, maak
media en publiceer zoals altijd. Zet die tag in het product. `sync` koppelt de verhalen aan het product; vanaf dan
kan alleen wie het product heeft ze lezen. Die tag hoort niet in de `stories.tags` van de editie, anders staan de
verhalen ook in de gewone lijst (voor kopers dubbel, en voor anderen ontbreken ze daar toch).

## Wat de leerling ziet

Op het startscherm krijgt elk zichtbaar product een tegel naast Verhalen, Woorden en Zinnen. Heeft hij het, dan
staat er "van jou" en opent de tegel de inhoud. Is het `live` en heeft hij het niet, dan ziet hij een slotje en de
prijs. Is het `coming`, dan staat er "binnenkort". Elke tegel leidt naar de eigen pagina van het product,
`/almanya/p/dtz-training`, met de uitleg en daaronder de inhoud, de koopknop of de wachtlijst.

Zolang betalen in de app er nog niet is (Stripe), staat de koopknop uit en kan de leerling zijn e-mail achterlaten.
De wachtlijst is dan meteen je lijst van mensen die willen kopen.

## De database bewaakt de inhoud

De app verbergt niet alleen wat iemand niet heeft. De database geeft een verhaal dat bij een product hoort alleen
af aan wie dat product heeft (de leesregel op `stories`; scènes, vragen en vertalingen volgen die regel). Wie het
adres van zo'n verhaal raadt of de database rechtstreeks aanspreekt, krijgt niets. De beelden en opnames zelf staan
in openbare opslag onder een willekeurige naam, dus die zijn zonder het verhaal niet te vinden.

## Aankopen

Elke aankoop is een regel in `purchases`: wie, welk product, hoe (`stripe`, `manual`, `gift`, `trial`), voor
hoeveel, tot wanneer, en een notitie. Een verlenging of tweede aankoop is een nieuwe regel, zodat de geschiedenis
bewaard blijft. Alleen jij (en straks Stripe) schrijft aankopen; een leerling kan alleen zijn eigen aankopen zien.

    python storylingo.py grant <e-mail|id> <product>            geven, voorgoed (cadeau, betaling buiten de app)
    python storylingo.py grant <e-mail|id> <product> 14 proef   proefperiode van 14 dagen, met notitie
    python storylingo.py revoke <e-mail|id> <product>           weer afnemen
    python storylingo.py purchases [product]                    wie heeft wat

Een leerling zonder account heeft nog geen e-mailadres; dan werkt alleen zijn id. Met inloggen per e-mail (stap 2)
gaat dit met het adres.
