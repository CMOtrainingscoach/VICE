# Start Next dev without stale NEXT_PUBLIC_* from the shell (Next.js won't override existing env vars).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue

Write-Host "Starting pnpm dev (env vars only from .env.local)..." -ForegroundColor Cyan
pnpm dev
