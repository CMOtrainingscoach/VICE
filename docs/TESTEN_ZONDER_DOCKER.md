# VICE testen zonder Docker Desktop

De **Next.js-app** draait gewoon op je machine. Alleen de **database + Auth** moeten ergens draaien. Dat kan in de **Supabase-cloud** (gratis tier voor ontwikkeling) — geen Docker nodig.

## Wat je wél/l niet nodig hebt

| Onderdeel | Zonder Docker |
|-----------|----------------|
| `pnpm dev`, `pnpm build`, `pnpm test` | Ja |
| `pnpm test:e2e` (login-pagina, toegankelijkheid) | Ja |
| Inloggen, klanten, MFA, invites | Ja, met **cloud**-Supabase |
| `supabase start` (lokaal alles-in-één) | Nee — dat is Docker |
| `pnpm db:test` (pgTAP lokaal) | Alleen met Docker, of later op linked project |

## Aanbevolen: gratis Supabase-project (EU)

### 1. Project aanmaken (browser)

1. [supabase.com/dashboard](https://supabase.com/dashboard) → New project.
2. Regio: **Frankfurt (eu-central-1)**.
3. Database-wachtwoord bewaren (lokaal, niet in chat).

### 2. Terminal: CLI inloggen en koppelen

```powershell
cd C:\Users\JDI\Desktop\VICE
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref JOUW_PROJECT_REF
```

`project-ref` staat in de dashboard-URL: `https://supabase.com/dashboard/project/<project-ref>`.

### 3. Migraties naar de cloud (terminal)

```powershell
pnpm dlx supabase@latest db push
```

Dit past alle bestanden in `supabase/migrations/` toe op je cloud-database.

### 4. Schema `app` exposed (browser, eenmalig)

Dashboard → **Project Settings → API → Exposed schemas** → voeg **`app`** toe (naast `public`).

Zonder deze stap ziet de app tabellen in schema `app` niet via de API.

### 5. `.env.local` (lokaal bestand, nooit committen)

Dashboard → **Project Settings → API**:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable** (anon) key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY` (alleen voor `pnpm seed:demo`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_VICE_DEMO=true
```

### 6. Auth-redirects (browser)

**Authentication → URL configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`, `http://localhost:3000/auth/callback`

### 7. App starten (terminal)

```powershell
pnpm dev
```

Open http://localhost:3000 → account aanmaken (Auth → Users in dashboard, of signup als je dat aanzet) → `/bootstrap` → MFA → klanten.

Optioneel synthetische data:

```powershell
pnpm seed:demo
```

(Wachtwoorden verschijnen alleen in je terminal.)

## Snel testen zonder Supabase

Alleen frontend/CI-checks:

```powershell
pnpm test
pnpm build
pnpm test:e2e
```

De login-pagina laadt; echte sessies werken pas met `.env.local` + cloud (of Docker-lokaal).

## Als je later wél lokaal wilt

Alternatieven voor Docker Desktop op Windows:

- [Rancher Desktop](https://rancherdesktop.io/) (Kubernetes/Docker)
- [Podman Desktop](https://podman-desktop.io/) (met Docker-compat)

Daarna: `pnpm dlx supabase@latest start` zoals in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Veiligheid

- Gebruik voor ontwikkeling een **apart** cloudproject, geen productie.
- Zet geen echte klantdata in het free tier tot privacy/security-gates uit het plan zijn doorlopen.
- Deel **service_role** nooit en plak keys niet in chat.
