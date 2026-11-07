# Naar de cloud: Supabase + Vercel

Lokaal blijft de **werkplaats** (verhalen maken, beelden en stem op je eigen GPU, testen). De cloud wordt de
**etalage** waar leerlingen komen. De inhoud komt altijd uit `content/`; je kiest per commando waar het heen gaat:
zonder `--cloud` naar je laptop, met `--cloud` naar de cloud.

```
content/  ──sync──▶  lokale database (Docker)          ◀── app op localhost:3000
          ──sync --cloud──▶  Supabase in de cloud      ◀── app op Vercel (https, ook de microfoon op je telefoon)
```

Kosten: beide gratis (Supabase free: 500 MB database, 1 GB opslag; Vercel hobby). Een gratis Supabase-project
pauzeert na een week zonder bezoek; één klik in het dashboard zet het weer aan. Voor echte klanten later: Supabase
Pro (25 dollar per maand) en Vercel Pro.

## Wat al klaarstaat (2026-11-07)

- De app praat online rechtstreeks met Supabase (`NEXT_PUBLIC_SUPABASE_URL`), zodat beelden en geluid van het CDN van
  Supabase komen en niet via Vercel; lokaal blijft het via `/sb`, zodat je telefoon thuis werkt.
- Alle tabellen hebben Row Level Security; er staat geen geheime sleutel in de app; de opslagbucket `assets` komt
  met een migratie mee.
- `storylingo.py … --cloud` leest `pipeline/.env.cloud` in plaats van `.env`.
- `media-export` + `media-import --cloud` zetten alle 660 beelden en opnames (134 MB) over op vingerafdruk, zonder ze
  opnieuw te maken. Getest door de bestanden van een verhaal lokaal te wissen en terug te zetten.
- De productiebouw is getest: `/` geeft 404 en `noindex`, de zes edities 200, oude links worden doorgestuurd.

## Wat jij doet (accounts en sleutels: dat doe ik niet)

### 1. Supabase-project

1. Maak een account op supabase.com (inloggen met GitHub is het makkelijkst).
2. **New project**: naam `storylingo`, regio **Central EU (Frankfurt)** (je klanten zitten in Europa; AVG),
   een sterk databasewachtwoord (bewaar het in je wachtwoordmanager).
3. **Authentication > Sign In / Providers**: zet **Allow anonymous sign-ins** aan (leerlingen beginnen zonder account).
4. Maak `pipeline/.env.cloud` (kopie van `pipeline/.env.cloud.example`) en vul in:
   - `SUPABASE_URL` en de **secret key**: Project Settings > API Keys
   - `DATABASE_URL`: knop **Connect** bovenaan > Session pooler (vul je wachtwoord in)
5. In een terminal (in `C:\dev\storylingo`): `npx supabase@3.0.0 login` en daarna
   `npx supabase@3.0.0 link --project-ref <project-ref>` (de code in je project-URL).

### 2. GitHub

Maak een **privé** repository `storylingo` op github.com (leeg, zonder README). Zeg het als het er is: ik zet de code
erop (na jouw akkoord, want dat is de eerste keer dat de code je laptop verlaat).

### 3. Vercel

1. Maak een account op vercel.com met GitHub.
2. **Add New > Project** > kies `storylingo` > **Root Directory: `web`**.
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = de project-URL (https://….supabase.co)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = de **publishable** key (Project Settings > API Keys; nooit de secret key)
4. **Deploy**.

## Wat ik daarna doe

1. `npx supabase@3.0.0 db push`: alle migraties in de cloud (tabellen, RLS, bucket).
2. `storylingo.py sync --cloud`: talen, edities en alle verhalen.
3. `storylingo.py media-import --cloud`: alle beelden, opnames en reacties van de leraar (de export staat al klaar).
4. `storylingo.py check --cloud` tot hij "complete and in sync" zegt.
5. Testen op het Vercel-adres: elke editie, een verhaal van begin tot eind, hardop antwoorden en nazeggen op je
   telefoon, en dat `/` niets verraadt.

Daarna is je werkwijze: verhaal maken en testen zonder `--cloud`, en als het goed is hetzelfde commando met
`--cloud` (`sync --cloud`, `media <slug> --cloud`).

## Goed om te weten

- **Voortgang begint opnieuw.** Anonieme accounts horen bij één database en één browser; je lokale voortgang gaat niet
  mee. Leerlingen online beginnen vanzelf vers.
- **`SHOW_EDITIONS=1`** (het overzicht op `/` en draft-edities) zet je in Vercel bij Environment Variables; omdat `/`
  bij het bouwen wordt gemaakt, werkt het pas na een nieuwe deploy (Deployments > Redeploy). Alleen tijdelijk aanzetten.
- **Een eigen domein per editie** (bijv. duits-met-verhalen.nl) komt later: in Vercel bij Domains, en in het
  editiebestand bij `domain`.
- **Accounts met e-mail** ("Bewaar je voortgang") bouwen we na de overstap: dan zijn er echte https-adressen voor de
  inloglinks in de e-mail.
