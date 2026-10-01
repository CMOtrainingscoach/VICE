# Snelle diagnose - toont GEEN secrets
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

function Get-EnvValue($name) {
  if (-not (Test-Path ".env.local")) { return $null }
  foreach ($line in Get-Content ".env.local") {
    if ($line -match "^$([regex]::Escape($name))=(.*)$") {
      return $matches[1].Trim()
    }
  }
  return $null
}

Write-Host "=== VICE setup check ===" -ForegroundColor Cyan

$url = Get-EnvValue "NEXT_PUBLIC_SUPABASE_URL"
$pub = Get-EnvValue "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
$svc = Get-EnvValue "SUPABASE_SERVICE_ROLE_KEY"

Write-Host ("URL: " + $(if ($url) { "ok" } else { "MISSING" }))
Write-Host ("Publishable key: " + $(if ($pub -and $pub.Length -gt 20) { "ok ($($pub.Length) chars)" } else { "MISSING - paste keys in .env.local and Ctrl+S" }))
Write-Host ("Service role: " + $(if ($svc -and $svc.Length -gt 20) { "ok" } else { "optional for dev login" }))

$shellUrl = [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL", "Process")
$shellPub = [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Process")
if ($shellUrl -match "127\.0\.0\.1|localhost:54321" -or $shellPub -eq "test-anon-key") {
  Write-Host "Shell env overrides .env.local (Next.js will NOT replace already-set vars)." -ForegroundColor Red
  Write-Host "  Fix: close dev server, run in a NEW terminal OR:" -ForegroundColor Yellow
  Write-Host '  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL,Env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -EA SilentlyContinue; pnpm dev' -ForegroundColor Yellow
}

try {
  $r = Invoke-WebRequest "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 5
  Write-Host ("Dev server localhost:3000: " + $r.StatusCode) -ForegroundColor Green
} catch {
  Write-Host "Dev server: NOT RUNNING - run: pnpm dev" -ForegroundColor Red
}

if ($url -and $pub) {
  $headers = @{ apikey = $pub; Authorization = "Bearer $pub"; Accept = "application/json" }
  try {
    $null = Invoke-RestMethod "$url/auth/v1/health" -Headers $headers -TimeoutSec 10
    Write-Host "Supabase Auth: reachable" -ForegroundColor Green
  } catch {
    Write-Host "Supabase Auth: failed (check URL/key)" -ForegroundColor Red
  }
  try {
    $h2 = $headers.Clone()
    $h2["Accept-Profile"] = "app"
    $tenantUrl = "$url/rest/v1/my_tenants?select=id$([char]38)limit=1"
    $null = Invoke-RestMethod $tenantUrl -Headers $h2 -TimeoutSec 10
    Write-Host "Schema app + migrations: ok" -ForegroundColor Green
  } catch {
    Write-Host "Schema app: FAIL - expose app in Dashboard API + run db push" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Linked CLI:" -NoNewline
if (Test-Path "supabase\.temp\project-ref") { Write-Host " project-ref present" } else { Write-Host " run route-a-link-and-push.ps1" }
