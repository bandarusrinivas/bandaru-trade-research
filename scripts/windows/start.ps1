#Requires -Version 5.1
<#
  Bandaru Trade Research — daily launcher (Windows)

  Run AFTER install.bat has done the initial setup. No build, no prompts,
  no .env creation — just brings the stack up and opens the dashboard.

  The Schwab profile is auto-enabled if the .env has Schwab credentials
  AND DATA_SOURCE=schwab. Otherwise we run Yahoo-only (Mongo + server +
  client, no Python sidecar).
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "Starting Bandaru Trade Research..." -ForegroundColor Cyan
Write-Host ""

# Sanity: Docker Desktop running?
try {
    $null = docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw "down" }
} catch {
    Write-Host "  ✗ Docker Desktop isn't running. Open it first, then re-run start.bat." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

# Sanity: .env present?
if (-not (Test-Path ".env")) {
    Write-Host "  ✗ .env not found. Run install.bat first." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

# Detect mode from .env so we use the right --profile flag.
$envContent = Get-Content ".env" -Raw
$useSchwab = ($envContent -match "(?m)^DATA_SOURCE\s*=\s*schwab") -and
             ($envContent -match "(?m)^SCHWAB_API_KEY\s*=\s*\S+")

Push-Location "mern"
try {
    $cmd = @("compose", "--env-file", "..\.env")
    if ($useSchwab) { $cmd += @("--profile", "schwab") }
    $cmd += @("up", "-d")
    & docker @cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ docker compose failed (exit $LASTEXITCODE)" -ForegroundColor Red
        Read-Host "Press Enter to close"
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

# Quick health check then open browser.
Start-Sleep -Seconds 3
$ready = $false
foreach ($_ in 1..30) {
    try {
        $r = Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

if ($ready) {
    Start-Process "http://localhost:3000"
    Write-Host "  ✓ Dashboard live at http://localhost:3000" -ForegroundColor Green
    if ($useSchwab) {
        Write-Host "  ℹ Real-time Schwab mode. If the banner says 'token rejected', run auth-schwab.bat" -ForegroundColor DarkGray
    } else {
        Write-Host "  ℹ Yahoo delayed mode (15-min delay)." -ForegroundColor DarkGray
    }
} else {
    Write-Host "  ! Dashboard didn't respond yet. Containers may still be starting." -ForegroundColor Yellow
    Write-Host "    Check with: cd mern && docker compose ps" -ForegroundColor DarkGray
}

Start-Sleep -Seconds 3
