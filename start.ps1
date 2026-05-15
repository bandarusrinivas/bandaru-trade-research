# Bandaru Trade Research — single entry point (Windows PowerShell).
# Shows a menu, then delegates to scripts/windows/.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$Root = $PSScriptRoot

$v = if (Test-Path "$Root\VERSION") { (Get-Content "$Root\VERSION" -Raw).Trim() } else { "dev" }
Clear-Host
Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ("  Bandaru Trade Research - v{0}" -f $v)                          -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Pick a mode:"
Write-Host ""
Write-Host "    1)  Docker            - Mongo + Express + nginx       (Yahoo data)"
Write-Host "    2)  Docker + Schwab   - adds real-time data sidecar   (requires token)"
Write-Host "    3)  Local Node        - Express + Vite, no Docker     (Yahoo data)"
Write-Host "    4)  Python (Schwab)   - legacy Flask app              (real-time, no Docker)"
Write-Host ""
Write-Host "    q)  Quit"
Write-Host ""

$choice = Read-Host "Choice"

switch ($choice.ToLower()) {
  "1" { & "$Root\scripts\windows\start-docker.ps1" }
  "2" { & "$Root\scripts\windows\start-docker-schwab.bat" }
  "3" { & "$Root\scripts\windows\start-local.ps1" }
  "4" { & "$Root\scripts\windows\start-schwab.bat" }
  "q" { exit 0 }
  default {
    Write-Host "[X] Invalid choice. Run again and pick 1-4 or q." -ForegroundColor Red
    Read-Host "Press Enter to exit"
  }
}
