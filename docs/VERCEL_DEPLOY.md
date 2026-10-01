# Deploy op Vercel

## Projectinstellingen (belangrijk bij 404)

In **Vercel → Project → Settings → General**:

| Instelling | Waarde |
|------------|--------|
| Framework Preset | **Next.js** |
| Root Directory | *(leeg)* |
| Output Directory | *(leeg — niet `out` of `.next`)* |
| Install Command | `pnpm install` |
| Build Command | `pnpm run build` |

Een gevulde **Output Directory** levert vaak de Vercel-pagina *“This page doesn't exist”* / `404 NOT_FOUND` op — er is dan geen Next-server, alleen een lege static map.

## Environment variables

Zet minimaal (Production + Preview):

- `NEXT_PUBLIC_SUPABASE_URL` — `https://….supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — anon/publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — server only
- `NEXT_PUBLIC_APP_URL` — `https://jouw-project.vercel.app` (of custom domain)

Optioneel (meetings):

- `OPENAI_API_KEY`
- `VICE_DELETE_AUDIO_AFTER_TRANSCRIBE=true`
- `VICE_ANALYSIS_MODEL=gpt-4o-mini`

Na env-wijziging: **Redeploy**.

## Supabase Auth

Dashboard → **Authentication → URL configuration**:

- Site URL = productie-URL
- Redirect URLs: `https://jouw-domein/**`, `http://localhost:3000/**`

## Na deploy

1. Open de **Production**-URL uit het Vercel-dashboard (niet een oude preview-link).
2. Controleer **Deployments** → laatste build = **Ready** (geen Error).
3. `/` → redirect naar `/login` of `/vandaag`.

## Build lokaal verifiëren

```powershell
pnpm install
pnpm run build
```
