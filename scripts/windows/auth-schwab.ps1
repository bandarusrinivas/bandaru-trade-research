#Requires -Version 5.1
<#
  Bandaru Trade Research — Schwab OAuth (Windows)
  ───────────────────────────────────────────────
  Runs the same manual OAuth flow as the Mac auth-schwab-docker.command,
  inside the already-built bandaru-schwab container. No Python venv on
  the host required.

  Token is written to legacy-python\schwab_token.json on the host (the
  folder is volume-mounted into the container).
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Schwab OAuth — via Docker container                          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verify Docker + sidecar container ────────────────────────────────
try { $null = docker info 2>$null; if ($LASTEXITCODE -ne 0) { throw } } catch {
    Write-Host "  ✗ Docker Desktop isn't running." -ForegroundColor Red
    Read-Host "Press Enter to close"; exit 1
}

$running = (docker ps --format '{{.Names}}' 2>$null) -split "`n" | Where-Object { $_ -eq "bandaru-schwab" }
if (-not $running) {
    Write-Host "  ✗ The bandaru-schwab container isn't running." -ForegroundColor Red
    Write-Host ""
    Write-Host "    Run install.bat (or start.bat) first to bring up the stack" -ForegroundColor Yellow
    Write-Host "    with Schwab profile enabled, then re-run auth-schwab.bat." -ForegroundColor Yellow
    Read-Host "Press Enter to close"; exit 1
}
Write-Host "  ✓ bandaru-schwab container is running" -ForegroundColor Green

# ── 2. Non-destructively snapshot the existing token ────────────────────
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "  → Snapshotting existing token (non-destructive)..." -ForegroundColor DarkGray
$snapCmd = "if [ -f /tokens/schwab_token.json ]; then " +
           "cp /tokens/schwab_token.json /tokens/schwab_token.json.preauth-$stamp.bak; " +
           "echo '    existing token snapshotted; original kept in place'; " +
           "else echo '    no existing token — clean start'; fi"
docker exec bandaru-schwab sh -c $snapCmd | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

# ── 3. Walkthrough banner ──────────────────────────────────────────────
Write-Host ""
@"
What's about to happen:
  1. A Schwab authorization URL is printed below.
  2. Copy it into your browser; sign in with your Schwab BROKERAGE account
     (not the developer-portal account).
  3. Approve "Bandaru Trade Research" on the consent screen.
  4. Schwab redirects to https://127.0.0.1/?code=... — the page will look
     broken (cert error / "site can't be reached"). THAT IS EXPECTED.
  5. Copy the ENTIRE address-bar URL from that broken page.
  6. Paste it back into this window when prompted, press Enter.
"@
Write-Host ""
Read-Host "Press Enter to begin the OAuth flow..."

# ── 4. Run the manual OAuth flow inside the container ──────────────────
# -it gives schwab-py a real stdin so it can prompt for the redirect URL.
Write-Host ""
docker exec -it bandaru-schwab python -m src.schwab_setup
$rc = $LASTEXITCODE

if ($rc -ne 0) {
    Write-Host ""
    Write-Host "  ✗ OAuth did NOT complete (exit $rc)." -ForegroundColor Red
    Write-Host "    Most common causes:" -ForegroundColor Yellow
    Write-Host "      • Redirect URL pasted incomplete — copy the WHOLE address bar"
    Write-Host "        starting with https://127.0.0.1/?code="
    Write-Host "      • Auth code expired (~30s window) — re-run and move quickly"
    Write-Host "      • Wrong account — must be Schwab BROKERAGE, not developer portal"
    Read-Host "Press Enter to close"
    exit $rc
}

# ── 5. Refresh the sidecar so it loads the new token ───────────────────
Write-Host ""
Write-Host "  → Restarting sidecar so it picks up the new token..." -ForegroundColor DarkGray
docker restart bandaru-schwab | Out-Null
Write-Host ""
Write-Host "  ✓ Token saved AND verified — Schwab accepted it." -ForegroundColor Green
Write-Host "    Token file: legacy-python\schwab_token.json (good for 7 days)"
Write-Host ""
Write-Host "    Refresh http://localhost:3000 — the 'DELAYED DATA' banner should clear."
Write-Host ""
Read-Host "Press Enter to close"
