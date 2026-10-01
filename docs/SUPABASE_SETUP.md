# Supabase-configuratie (fase 1)

Voer deze stappen zelf uit in het Supabase-dashboard of lokaal via de CLI. **Deel nooit secrets in chat.**

**Geen Docker Desktop?** Gebruik een gratis cloud-project + `supabase db push`. Zie [TESTEN_ZONDER_DOCKER.md](./TESTEN_ZONDER_DOCKER.md).

## Lokaal (ontwikkeling, vereist Docker)

1. Start Docker Desktop.
2. `pnpm dlx supabase@latest start`
3. `pnpm dlx supabase@latest status` — kopieer API URL, anon key en service role key naar `.env.local` (zie `.env.example`).
4. `pnpm dlx supabase@latest db reset` — migrations + seed-hook.
5. Maak je echte admin: registreer via Auth (dashboard) of gebruik `pnpm seed:demo` alleen voor synthetische testdata.
6. Zet `VICE_BOOTSTRAP_ADMIN_USER_ID=<jouw auth.users uuid>` als je bootstrap wilt beperken tot één account.
7. `pnpm dev`

## Gehost project (staging, EU)

1. Organisatie: MFA aan voor teamleden.
2. Nieuw project, regio **Frankfurt (eu-central-1)**.
3. **Authentication → Providers**: e-mail aan, **Confirm email** aan.
4. **Authentication → Providers → Email**: OTP/magic link expiry ≤ 3600 s (aanbevolen).
5. **Authentication → MFA**: TOTP inschakelen; voor Hardwig afdwingen via app + RLS (`aal2`).
6. **Authentication → SMTP**: custom SMTP voor betrouwbare mail (default limiet is laag).
7. **Authentication → Rate limits**: review signup/recover/MFA-limieten.
8. **Database → Settings**: SSL enforcement aan; overweeg network restrictions voor prod.
9. **API Settings**: schema `app` exposed (lokaal staat dit in `supabase/config.toml`; cloud: Settings → API → Exposed schemas).
10. Redirect URLs: `http://localhost:3000/**` en je staging-URL + `/auth/callback`.
11. Pro-plan vóór echte klantdata; backups en retentie volgens plan document.

## Bootstrap admin (eenmalig)

1. Log in met je account.
2. Ga naar `/bootstrap` zolang er nog geen platform admin is.
3. Voltooi MFA op `/mfa/enroll`.
4. Daarna: klanten aanmaken, uitnodigingen, enz.

## Synthetische demo

- `NEXT_PUBLIC_VICE_DEMO=true` toont de demo-banner.
- `pnpm seed:demo` maakt demo-gebruikers en **Studio Noord (demo)** — geen echte verwerking.
