# Bandaru Trade Research - stop launcher (Windows PowerShell)

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

Write-Host "Stopping Bandaru Trade Research..."

# 1) Docker mode
if (Get-Command docker -ErrorAction SilentlyContinue) {
  if (Test-Path "$PSScriptRoot\mern\docker-compose.yml") {
    Push-Location "$PSScriptRoot\mern"
    $services = docker compose ps --services 2>$null
    if ($services) {
      Write-Host "  - Bringing down docker compose stack..."
      docker compose down
    }
    Pop-Location
  }
}

# 2) Dev mode - kill PIDs persisted by start.ps1
$pidFile = Join-Path $env:TEMP "bandaru.pids"
if (Test-Path $pidFile) {
  $pids = (Get-Content $pidFile -Raw).Trim().Split(" ")
  foreach ($pid in $pids) {
    try {
      $p = Get-Process -Id $pid -ErrorAction Stop
      Write-Host "  - Killing PID $pid ($($p.ProcessName))"
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    } catch { }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# 3) Belt-and-suspenders: anything still listening on :4000 / :5173 / :5000
#    (4000 = MERN Express, 5173 = Vite, 5000 = legacy Python Flask)
foreach ($port in 4000, 5173, 5000) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    if ($c.OwningProcess -gt 0) {
      Write-Host "  - Killing leftover process on port $port (PID $($c.OwningProcess))"
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Stopped." -ForegroundColor Green
Read-Host "Press Enter to close this window"
