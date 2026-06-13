#Requires -Version 5.1
<#
  Bandaru Trade Research — stopper (Windows)
  Brings the stack down. Keeps your Mongo trade-journal data
  (the named volume `mongo-data` survives docker compose down).
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "Stopping Bandaru Trade Research..." -ForegroundColor Cyan

if (-not (Test-Path "mern\docker-compose.yml")) {
    Write-Host "  ! mern\docker-compose.yml not found — nothing to stop." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    exit 0
}

Push-Location "mern"
try {
    & docker compose down
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Containers stopped (your trade-journal data is preserved)." -ForegroundColor Green
    } else {
        Write-Host "  ! docker compose down returned $LASTEXITCODE — check Docker Desktop." -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}

Start-Sleep -Seconds 2
