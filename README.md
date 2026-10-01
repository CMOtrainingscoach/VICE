# VICE

Klant- en strategieplatform (MVP fase 1): Auth, tenants, klantenbeheer, RLS.

## Vereisten

- Node.js 24+
- pnpm 11+
- **Supabase:** cloud-project (geen Docker) **of** Docker voor `supabase start` lokaal

## Starten (zonder Docker — aanbevolen)

Volledige stappen: **[docs/TESTEN_ZONDER_DOCKER.md](docs/TESTEN_ZONDER_DOCKER.md)**

```powershell
pnpm install
copy .env.example .env.local
# Vul .env.local met keys uit Supabase Dashboard (cloud)

pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref JOUW_REF
pnpm dlx supabase@latest db push

pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Exposed schema **`app`** in dashboard niet vergeten.

## Vercel

Zie **[docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md)** (404-troubleshooting, env vars, Supabase redirects).

## Starten (met Docker, volledig lokaal)

```powershell
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm seed:demo   # optioneel
pnpm dev
```

Zie [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) voor dashboard-instellingen.

## Scripts

| Script | Doel |
|--------|------|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Productiebuild |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright (start dev server) |
| `pnpm db:reset` | Supabase migrations reset |
| `pnpm db:test` | pgTAP database tests |
| `pnpm seed:demo` | Synthetische demo-data |

## Fase 1 scope

- Design tokens, light/dark/systeem
- Login, reset, MFA (verplicht admin), bootstrap, invites
- Klanten CRUD, archiveren, verwijderverzoek
- Tenant-isolatie via RLS

Niet in fase 1: meetingrecorder, audit, dashboard-engine (UI toont eerlijke placeholders).

## Visuele referentie

[docs/design/Mockup.png](docs/design/Mockup.png)
