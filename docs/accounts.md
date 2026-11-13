# Accounts en inloggen

## Het idee

Iedereen begint zonder account. Wie de app opent, krijgt in stilte een anoniem account voor die browser. Zo kan hij
met één tik aan een verhaal beginnen: geen formulier, geen wachtwoord. Alles wat hij doet (niveau, verhalen, woorden,
herkomst uit een advertentie) hangt meteen aan dat account.

Om een e-mailadres vragen we pas als het hem iets oplevert:

- **na zijn eerste afgemaakte verhaal** verschijnt op het startscherm "Bewaar je voortgang met je e-mailadres". Dan
  heeft hij iets te verliezen, dus is de vraag logisch en niet opdringerig. Wie een account heeft, ziet de kaart niet;
- **via het 👤-icoon** rechtsboven op het startscherm, op elk moment;
- **bij het kopen** (stap 3, Stripe): een aankoop moet aan een e-mailadres hangen.

## Eén veld, twee gevallen

Op `/almanya/account` vult hij zijn e-mailadres in en krijgt hij een code van 6 cijfers per mail. Er zijn geen
wachtwoorden en er is niets om op te klikken in de mail, alleen de code. Dat werkt ook als iemand zijn mail op een
ander toestel leest.

- **Nieuw adres**: zijn anonieme account krijgt dat adres. Het blijft hetzelfde account, dus al zijn voortgang blijft.
- **Bekend adres** (hij heeft al een account, bijvoorbeeld op zijn telefoon en nu op een laptop): hij logt in op dat
  account. Wat hij op dit toestel anoniem deed, blijft hier achter. Dat staat er ook bij.

Na de code laadt de pagina opnieuw als dat account. Uitloggen kan op de accountpagina: het account houdt alles, en
het toestel begint daarna als nieuwe anonieme bezoeker.

Een adres komt pas bij een account na de juiste code. Zonder die controle kon iemand andermans adres claimen
("Confirm email" moet daarom aan staan, zie hieronder).

## Wat we van een leerling weten

Zonder iets te vragen: via welke editie, track en campagne hij binnenkwam, zijn niveau, wat hij speelt, wanneer hij
voor het laatst kwam en de taal van zijn telefoon (bijvoorbeeld `ar-SY`, handig om te zien welk publiek een
campagne bereikt). Met een account ook zijn e-mailadres, en bij een aankoop wat hij kocht.

Eén vinkje vraagt "Stuur me af en toe tips en aanbiedingen". Het staat standaard uit, en we bewaren het moment van
de ja. In de EU mag je zonder die toestemming geen marketingmail sturen, en je moet kunnen laten zien wanneer
iemand ja zei. Hij kan het op de accountpagina altijd weer uitzetten.

    python storylingo.py learners          leerlingen met een account: adres, taal, tips ja/nee, herkomst, pakketten
    python storylingo.py learners all      ook de anonieme
    python storylingo.py grant <e-mail> <product>   werkt nu ook op e-mailadres

## Online aanzetten (eenmalig, in het Supabase-dashboard)

Lokaal staat dit in `supabase/config.toml`; in de cloud zet je het in het dashboard van je project:

1. **Authentication → Sign In / Providers → Email**: *Confirm email* **aan**, *Secure email change* **uit** (een
   anoniem account heeft geen oud adres), lengte van de code **6**.
2. **Authentication → Emails → Templates**: bij *Change email address*, *Magic link* en *Confirm signup* het
   onderwerp `Qissio: {{ .Token }}` en als tekst de inhoud van `supabase/templates/code.html`.
3. **Een eigen mailserver (SMTP)**. De ingebouwde mail van Supabase stuurt alleen naar de adressen van je eigen team
   en maar een paar per uur: voor echte leerlingen werkt die niet. Neem bijvoorbeeld Resend (gratis tot 3.000 mails
   per maand, 100 per dag), verifieer daar je domein, en vul de SMTP-gegevens in onder **Authentication → Emails →
   SMTP Settings**. Zet daarna de limiet onder **Authentication → Rate Limits** voor e-mails hoger (bijvoorbeeld 100
   per uur).

Zonder stap 3 werkt inloggen online alleen voor jezelf.
