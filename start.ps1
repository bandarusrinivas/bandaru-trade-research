# Bandaru Trade Research - one-click launcher (Windows PowerShell)
# Right-click -> Run with PowerShell. Tries Docker first; falls back to local Node dev.
# If execution policy blocks it:  powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$ProjectRoot = $PSScriptRoot
$UrlProd = "http://localhost:3000"
$UrlDev  = "http://localhost:5173"

function Banner {
  $v = "dev"
  if (Test-Path "$ProjectRoot\VERSION") { $v = (Get-Content "$ProjectRoot\VERSION" -Raw).Trim() }
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  Bandaru Trade Research - v$v" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
}

function Has-Cmd($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

function Start-Docker {
  Write-Host "-> Docker detected. Starting production stack..."
  Push-Location "$ProjectRoot\mern"
  docker compose up -d --build
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Warning "docker compose failed. Falling back to dev mode..."
    Start-Dev
    return
  }
  Pop-Location
  Write-Host ""
  Write-Host "Stack is up. Opening $UrlProd" -ForegroundColor Green
  Start-Process $UrlProd
  Write-Host ""
  Write-Host "Tail logs:    docker compose logs -f"
  Write-Host "Stop:         double-click stop.ps1  (or 'docker compose down' in mern\)"
}

function Start-Dev {
  Write-Host "-> Docker not available. Starting local Node dev mode..."
  if (-not (Has-Cmd node)) {
    Write-Host "[X] Node.js is required. Install Node 20+ from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
  $nodeMajor = [int]((& node -v) -replace '^v([0-9]+).*','$1')
  if ($nodeMajor -lt 18) {
    Write-Host "[X] Node $nodeMajor detected. Need Node 18 or newer." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }

  if (-not (Test-Path "$ProjectRoot\mern\server\node_modules")) {
    Write-Host "  - Installing server deps..."
    Push-Location "$ProjectRoot\mern\server"; npm install --no-audit --no-fund; Pop-Location
  }
  if (-not (Test-Path "$ProjectRoot\mern\client\node_modules")) {
    Write-Host "  - Installing client deps..."
    Push-Location "$ProjectRoot\mern\client"; npm install --no-audit --no-fund; Pop-Location
  }

  Write-Host ""
  Write-Host "  - Booting Express on :4000 (Trade Journal disabled without Mongo)..."
  $serverLog = Join-Path $env:TEMP "bandaru-server.log"
  $clientLog = Join-Path $env:TEMP "bandaru-client.log"
  $env:MONGO_URI = "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
  $server = Start-Process -PassThru -WindowStyle Minimized -FilePath "node" -ArgumentList "server.js" `
    -WorkingDirectory "$ProjectRoot\mern\server" -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err"

  Write-Host "  - Booting Vite dev server on :5173..."
  $client = Start-Process -PassThru -WindowStyle Minimized -FilePath "npm.cmd" -ArgumentList "run","dev" `
    -WorkingDirectory "$ProjectRoot\mern\client" -RedirectStandardOutput $clientLog -RedirectStandardError "$clientLog.err"

  # Persist PIDs for stop.ps1
  "$($server.Id) $($client.Id)" | Out-File -FilePath (Join-Path $env:TEMP "bandaru.pids") -Encoding ASCII

  Write-Host ""
  Write-Host "Waiting for the dev server to come up..."
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $UrlDev -TimeoutSec 1
      if ($r.StatusCode -eq 200) { break }
    } catch { }
  }

  Write-Host "Opening $UrlDev" -ForegroundColor Green
  Start-Process $UrlDev
  Write-Host ""
  Write-Host "Server log:  $serverLog"
  Write-Host "Client log:  $clientLog"
  Write-Host "Stop:        double-click stop.ps1 (or stop.bat)"
}

Banner
$useDocker = $false
if (Has-Cmd docker) {
  docker info *>$null
  if ($LASTEXITCODE -eq 0) { $useDocker = $true }
}
if ($useDocker) { Start-Docker } else { Start-Dev }

Read-Host "Press Enter to close this window"
