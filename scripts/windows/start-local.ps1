# Bandaru Trade Research - local launcher (Windows PowerShell)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $Root
$Url = "http://localhost:5173"

$v = if (Test-Path "$Root\VERSION") { (Get-Content "$Root\VERSION" -Raw).Trim() } else { "dev" }
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Bandaru Trade Research - v$v"          -ForegroundColor Cyan
Write-Host "  Mode: Local Node (dev, Yahoo)"         -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Node 20+ required from https://nodejs.org" -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
$nodeMajor = [int]((& node -v) -replace '^v([0-9]+).*','$1')
if ($nodeMajor -lt 18) { Write-Host "[X] Need Node 18+" -ForegroundColor Red; Read-Host; exit 1 }

if (-not (Test-Path "$Root\mern\server\node_modules")) {
  Push-Location "$Root\mern\server"; npm install --no-audit --no-fund; Pop-Location
}
if (-not (Test-Path "$Root\mern\client\node_modules")) {
  Push-Location "$Root\mern\client"; npm install --no-audit --no-fund; Pop-Location
}

$mongoUri = "mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.ConnectAsync("127.0.0.1", 27017).Wait(300) | Out-Null
  if ($tcp.Connected) { $mongoUri = "mongodb://127.0.0.1:27017/bandaru"; $tcp.Close(); Write-Host "MongoDB detected" }
} catch { Write-Host "No MongoDB - Journal disabled" }

$serverLog = Join-Path $env:TEMP "bandaru-server.log"
$clientLog = Join-Path $env:TEMP "bandaru-client.log"
$env:MONGO_URI = $mongoUri
$server = Start-Process -PassThru -WindowStyle Minimized -FilePath "node" -ArgumentList "server.js" `
  -WorkingDirectory "$Root\mern\server" -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err"
$client = Start-Process -PassThru -WindowStyle Minimized -FilePath "npm.cmd" -ArgumentList "run","dev" `
  -WorkingDirectory "$Root\mern\client" -RedirectStandardOutput $clientLog -RedirectStandardError "$clientLog.err"
"$($server.Id) $($client.Id)" | Out-File (Join-Path $env:TEMP "bandaru.pids") -Encoding ASCII

for ($i=0; $i -lt 30; $i++) {
  Start-Sleep 1
  try { if ((Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1).StatusCode -eq 200) { break } } catch {}
}
Write-Host "Opening $Url" -ForegroundColor Green
Start-Process $Url
Read-Host "Press Enter to close"
