# Bandaru Trade Research - Docker launcher (Windows PowerShell)
# Runs the full production stack: Mongo + Express + nginx-served React.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$Url = "http://localhost:3000"

$v = if (Test-Path "$PSScriptRoot\VERSION") { (Get-Content "$PSScriptRoot\VERSION" -Raw).Trim() } else { "dev" }
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Bandaru Trade Research - v$v"          -ForegroundColor Cyan
Write-Host "  Mode: Docker (production)"             -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Docker is not installed." -ForegroundColor Red
  Write-Host "    Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  Write-Host "    Or use start-local.ps1 if you'd rather run with local Node."
  Read-Host "Press Enter to exit"; exit 1
}

docker info *>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "[X] Docker is installed but the daemon isn't running." -ForegroundColor Red
  Write-Host "    Open Docker Desktop, wait for it to start, then re-run this script."
  Read-Host "Press Enter to exit"; exit 1
}

Write-Host "-> Building images + starting Mongo + Express + nginx..."
Push-Location "$PSScriptRoot\mern"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Host "[X] docker compose failed." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
Pop-Location

Write-Host ""
Write-Host "Stack is up. Opening $Url" -ForegroundColor Green
Start-Process $Url
Write-Host ""
Write-Host "Tail logs:    docker compose logs -f          (run from mern\)"
Write-Host "Stop:         double-click stop.ps1"
Write-Host "Wipe data:    docker compose down -v          (erases Trade Journal)"
Write-Host ""
Read-Host "Press Enter to close this window"
