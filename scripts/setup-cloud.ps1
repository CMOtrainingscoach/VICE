# VICE — cloud Supabase koppelen (zonder Docker)
# Run in PowerShell from repo root: .\scripts\setup-cloud.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== VICE cloud setup ===" -ForegroundColor Cyan

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Aangemaakt: .env.local — vul URL en keys in vóór pnpm dev." -ForegroundColor Yellow
}

$envContent = Get-Content ".env.local" -Raw
if ($envContent -match "NEXT_PUBLIC_SUPABASE_URL=\s*$" -or $envContent -notmatch "NEXT_PUBLIC_SUPABASE_URL=https://") {
  Write-Host ""
  Write-Host "STOP: Vul eerst NEXT_PUBLIC_SUPABASE_URL en keys in .env.local" -ForegroundColor Red
  Write-Host "Dashboard → Project Settings → API" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Stap 1: Supabase CLI login (opent browser)..." -ForegroundColor Green
pnpm dlx supabase@latest login
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $env:SUPABASE_PROJECT_REF) {
  $ref = Read-Host "Project ref (dashboard URL: .../project/REF)"
} else {
  $ref = $env:SUPABASE_PROJECT_REF
}

Write-Host ""
Write-Host "Stap 2: Link project $ref ..." -ForegroundColor Green
pnpm dlx supabase@latest link --project-ref $ref
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Stap 3: Migraties pushen (schema app + RLS)..." -ForegroundColor Green
pnpm db:push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Handmatig in Supabase Dashboard ===" -ForegroundColor Cyan
Write-Host "1. Settings → API → Exposed schemas: voeg 'app' toe"
Write-Host "2. Authentication → URL: Site URL http://localhost:3000"
Write-Host "   Redirect URLs: http://localhost:3000/** en http://localhost:3000/auth/callback"
Write-Host "3. Authentication → Providers → Email: Confirm email AAN (aanbevolen)"
Write-Host "4. Authentication → MFA: TOTP inschakelen"
Write-Host ""
Write-Host "Daarna: pnpm dev  →  http://localhost:3000" -ForegroundColor Green
Write-Host "Eerste login → /bootstrap → /mfa/enroll" -ForegroundColor Green
