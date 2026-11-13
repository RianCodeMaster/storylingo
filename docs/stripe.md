# Betalen met Stripe

## Hoe het werkt

Een leerling kiest op de Plus-pagina een prijs, vinkt aan dat Plus meteen mag beginnen (daarmee vervalt de wettelijke
bedenktijd van 14 dagen) en drukt op betalen. Onze server (`web/app/api/checkout`) controleert wie het is, of het
product bestaat en of hij het nog niet heeft, vraagt de prijs op bij Stripe en stuurt hem naar **Stripes eigen
betaalpagina**. Wij zien nooit een kaartnummer.

Na het betalen stuurt Stripe een bericht naar `/api/stripe/webhook`. De handtekening bewijst dat het van Stripe komt;
dan schrijft de server de aankoop in `purchases`, en vanaf dat moment opent de database Plus (`has_plus()`). Een
abonnement is één regel die bij elke verlenging een nieuwe einddatum krijgt (plus 2 dagen speling), bij opzeggen
afloopt, en bij beëindigen op `cancelled` gaat. Mist er ooit een bericht, dan loopt de toegang gewoon af aan het
einde van wat betaald is: nooit langer gratis.

Opzeggen, een andere kaart, facturen: dat doet de leerling zelf in het **klantportaal** van Stripe, via
"Abonnement en facturen beheren" op zijn accountpagina.

Betalen kan alleen met een account (e-mail). Een aankoop op een anoniem browseraccount zou verdwijnen met de browser.

## Prijzen

Prijzen staan in `content/products/<product>.yaml`, inclusief btw. `storylingo.py stripe` maakt de producten en
prijzen in Stripe na (een gewijzigd bedrag wordt een nieuwe prijs; bestaande abonnees houden hun oude prijs). De app
vindt een prijs in Stripe via zijn sleutel `plus-de-month`, `plus-de-year`; er staan dus nergens Stripe-id's in de code.

Testomgeving en live zijn in Stripe twee aparte werelden: draai `stripe` in elk één keer (en opnieuw na een
prijswijziging). Met een live-sleutel weigert het commando, tenzij je bewust `storylingo.py stripe live` typt.

## De sleutels

| waar | naam | wat |
|---|---|---|
| `pipeline/.env` | `STRIPE_SECRET_TESTKEY` | test: `sk_test_…` (voor `storylingo.py stripe`) |
| `pipeline/.env` | `STRIPE_SECRET_KEY` | live: `sk_live_…` (alleen voor `storylingo.py stripe live`) |
| `web/.env.local` | `STRIPE_SECRET_KEY` | test: `sk_test_…` |
| `web/.env.local` | `STRIPE_WEBHOOK_SECRET` | lokaal: wat `stripe listen` toont |
| `web/.env.local` | `SUPABASE_SECRET_KEY` | de serversleutel van de lokale Supabase (staat er al) |
| Vercel | `STRIPE_SECRET_KEY` | live: `sk_live_…` |
| Vercel | `STRIPE_WEBHOOK_SECRET` | wat Stripe toont bij de webhook (`whsec_…`) |
| Vercel | `SUPABASE_SECRET_KEY` | Supabase > Project Settings > API Keys > secret key |
| Vercel | `NEXT_PUBLIC_PAYMENTS` | `1`: de betaalknop aan (zonder: de wachtlijst, zoals voorheen) |
| Vercel | `STRIPE_AUTOMATIC_TAX` | `1` als Stripe Tax aanstaat (btw per land), anders weglaten |

Geen van deze heeft `NEXT_PUBLIC_`: ze blijven op de server.

## Eenmalig in het Stripe-dashboard

1. **Settings > Business > Public details**: naam Qissio, website https://qissio.com, support-e-mail.
2. **Settings > Branding**: logo en kleur.
3. **Settings > Payment methods**: kaart, iDEAL, SEPA-incasso, PayPal, Apple Pay, Google Pay.
4. **Settings > Billing > Customer portal**: opzeggen (aan het einde van de periode) en betaalmethode wijzigen aan.
5. **Developers > Webhooks > Add endpoint**: `https://qissio.com/api/stripe/webhook`, met de events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Kopieer de signing secret naar Vercel.
6. Btw: met Stripe Tax (Settings > Tax) rekent Stripe per land de juiste btw uit binnen de prijs; zet dan
   `STRIPE_AUTOMATIC_TAX=1` in Vercel.

Doe 1 t/m 5 eerst in de testomgeving, test, en daarna nog eens live.

## Live gaan

1. Vul `web/legal/company.ts` in (bedrijfsnaam, KvK, btw-nummer, adres) en laat de voorwaarden en privacyverklaring
   nalezen.
2. `storylingo.py stripe live` (gebruikt `STRIPE_SECRET_KEY` uit `pipeline/.env`).
3. In Vercel de live-sleutels en `NEXT_PUBLIC_PAYMENTS=1`; webhook live aanmaken; redeploy.
4. Eén echte betaling van jezelf, en meteen opzeggen in het portaal: kijk met `storylingo.py purchases` mee.

## Terugbetalen

Een terugbetaling doe je in het Stripe-dashboard. Bij een abonnement: zeg het daar ook op, dan sluit de webhook Plus.
Bij een eenmalige aankoop: daarna `storylingo.py revoke <e-mail> <product>`.
