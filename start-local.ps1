# Bandaru Trade Research - local launcher (Windows PowerShell, no Docker)
# Runs Express + Vite directly with your installed Node.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$ProjectRoot = $PSScriptRoot
$Url = "http://localhost:5173"

$v = if (Test-Path "$ProjectRoot\VERSION") { (Get-Content "$ProjectRoot\VERSION" -Raw).Trim() } else { "dev" }
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Bandaru Trade Research - v$v"          -ForegroundColor Cyan
Write-Host "  Mode: Local Node (dev)"                -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Node.js is not installed." -ForegroundColor Red
  Write-Host "    Install Node 20+ from https://nodejs.org"
  Write-Host "    Or use start-docker.ps1 if you'd rather run with Docker."
  Read-Host "Press Enter to exit"; exit 1
}

$nodeMajor = [int]((& node -v) -replace '^v([0-9]+).*','$1')
if ($nodeMajor -lt 18) {
  Write-Host "[X] Node $nodeMajor detected. Need Node 18 or newer." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
Write-Host "-> Node $(node -v) detected"

if (-not (Test-Path "$ProjectRoot\mern\server\node_modules")) {
  Write-Host "  - Installing server deps..."
  Push-Location "$ProjectRoot\mern\server"; npm install --no-audit --no-fund; Pop-Location
}
if (-not (Test-Path "$ProjectRoot\mern\client\node_modules")) {
  Write-Host "  - Installing client deps..."
  Push-Location "$ProjectRoot\mern\client"; npm install --no-audit --no-fund; Pop-Location
}

# Detect optional local MongoDB on :27017
$mongoUri = "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.ConnectAsync("127.0.0.1", 27017).Wait(300) | Out-Null
  if ($tcp.Connected) {
    Write-Host "  - Local MongoDB detected on :27017 - Trade Journal enabled"
    $mongoUri = "mongodb://127.0.0.1:27017/bandaru"
    $tcp.Close()
  }
} catch {
  Write-Host "  - No MongoDB on :27017 - Trade Journal disabled (everything else works)"
}

$serverLog = Join-Path $env:TEMP "bandaru-server.log"
$clientLog = Join-Path $env:TEMP "bandaru-client.log"
$env:MONGO_URI = $mongoUri

Write-Host ""
Write-Host "  - Booting Express on :4000..."
$server = Start-Process -PassThru -WindowStyle Minimized -FilePath "node" -ArgumentList "server.js" `
  -WorkingDirectory "$ProjectRoot\mern\server" -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err"

Write-Host "  - Booting Vite dev server on :5173..."
$client = Start-Process -PassThru -WindowStyle Minimized -FilePath "npm.cmd" -ArgumentList "run","dev" `
  -WorkingDirectory "$ProjectRoot\mern\client" -RedirectStandardOutput $clientLog -RedirectStandardError "$clientLog.err"

"$($server.Id) $($client.Id)" | Out-File -FilePath (Join-Path $env:TEMP "bandaru.pids") -Encoding ASCII

Write-Host ""
Write-Host "Waiting for the dev server to come up..."
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1
    if ($r.StatusCode -eq 200) { break }
  } catch { }
}

Write-Host "Opening $Url" -ForegroundColor Green
Start-Process $Url
Write-Host ""
Write-Host "Server log:  $serverLog"
Write-Host "Client log:  $clientLog"
Write-Host "Stop:        double-click stop.ps1"
Write-Host ""
Read-Host "Press Enter to close this window"
