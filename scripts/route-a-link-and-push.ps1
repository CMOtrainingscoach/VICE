# Route A: run AFTER `pnpm dlx supabase@latest login` in the SAME terminal.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Controleren of CLI ingelogd is..." -ForegroundColor Cyan
pnpm dlx supabase@latest projects list -o table
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Nog niet ingelogd. Run eerst:" -ForegroundColor Red
  Write-Host "  pnpm dlx supabase@latest login" -ForegroundColor White
  exit 1
}

$ref = "qwzhtbphsriqbjuksekw"
Write-Host ""
Write-Host "Koppelen aan project $ref ..." -ForegroundColor Green
Write-Host "(Database-wachtwoord = het wachtwoord bij projectaanmaak)" -ForegroundColor Yellow

if ($env:SUPABASE_DB_PASSWORD) {
  pnpm dlx supabase@latest link --project-ref $ref -p $env:SUPABASE_DB_PASSWORD
} else {
  pnpm dlx supabase@latest link --project-ref $ref
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Migraties pushen..." -ForegroundColor Green
pnpm db:push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Klaar. Dashboard:" -ForegroundColor Green
Write-Host "  - API → Exposed schemas: app"
Write-Host "  - Auth URLs voor localhost:3000"
Write-Host "Daarna: pnpm dev" -ForegroundColor Green
