# Bandaru Trade Research - Docker launcher (Windows PowerShell)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $Root
$Url = "http://localhost:3000"

$v = if (Test-Path "$Root\VERSION") { (Get-Content "$Root\VERSION" -Raw).Trim() } else { "dev" }
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Bandaru Trade Research - v$v"          -ForegroundColor Cyan
Write-Host "  Mode: Docker (production, Yahoo)"      -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Docker not installed." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
docker info *>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "[X] Docker daemon not running." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

Push-Location "$Root\mern"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Pop-Location; Read-Host "Press Enter to exit"; exit 1 }
Pop-Location

Write-Host "Stack up. Opening $Url" -ForegroundColor Green
Start-Process $Url
Read-Host "Press Enter to close"
