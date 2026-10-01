# Na supabase login OF SUPABASE_ACCESS_TOKEN in .env.local
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

function Import-DotEnv($path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^([^=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $val = $matches[2].Trim()
      if ($val -match '^["''](.+)["'']$') { $val = $matches[1] }
      Set-Item -Path "env:$name" -Value $val
    }
  }
}

Import-DotEnv ".env.local"

$ref = "qwzhtbphsriqbjuksekw"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Geen SUPABASE_ACCESS_TOKEN. Eerst in terminal:" -ForegroundColor Yellow
  Write-Host "  pnpm dlx supabase@latest login" -ForegroundColor White
  Write-Host "Of: Dashboard → Account → Access Tokens → token in .env.local als SUPABASE_ACCESS_TOKEN=" -ForegroundColor Yellow
}

Write-Host "Link project $ref ..."
if ($env:SUPABASE_DB_PASSWORD) {
  pnpm dlx supabase@latest link --project-ref $ref -p $env:SUPABASE_DB_PASSWORD
} else {
  pnpm dlx supabase@latest link --project-ref $ref
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Push migrations..."
pnpm db:push
exit $LASTEXITCODE
