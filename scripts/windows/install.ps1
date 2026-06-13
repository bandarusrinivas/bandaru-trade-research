#Requires -Version 5.1
<#
  Bandaru Trade Research — Windows installer (one-shot setup)
  ─────────────────────────────────────────────────────────────
  Handles everything the Mac start.command does, automated for Windows:

    1. Verify Docker Desktop is running
    2. Create .env from template if missing
    3. Prompt for Schwab API key + secret (or skip for Yahoo delayed mode)
    4. Update .env with credentials
    5. docker compose up --build from mern\ subfolder (with --profile schwab
       only when Schwab creds are present)
    6. Wait for the dashboard to come online
    7. Open http://localhost:3000 in the default browser

  Idempotent — safe to re-run. Won't overwrite an existing .env unless
  the -ForceEnv flag is passed.

  Invocation:
    Double-click install.bat at the project root.
    (That wrapper just calls this script with the right execution policy.)
#>

param(
    [switch]$YahooOnly,       # Skip the Schwab prompt; force Yahoo delayed mode
    [switch]$ForceEnv,        # Overwrite an existing .env from .env.example
    [switch]$NonInteractive   # No prompts; fail if .env can't be auto-populated
)

$ErrorActionPreference = "Stop"

# Resolve project root — this script lives at scripts/windows/install.ps1,
# so we walk up two levels to reach the folder containing docker-compose.yml.
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $ProjectRoot

# ─────────────────── presentation helpers ─────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  Bandaru Trade Research — Windows Installer                   ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}
function Step($n, $msg)  { Write-Host ""; Write-Host "▸ $n. $msg" -ForegroundColor Magenta }
function OK($msg)        { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg)      { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Err($msg)       { Write-Host "  ✗ $msg" -ForegroundColor Red }

# ─────────────────── 1. Prerequisite check ────────────────────────────
# Bundle every "you need this on your system" check into one section.
# Each sub-check prints its own ✓/!/✗ line so the user sees what's missing
# without having to scroll up. Returns $false on any HARD failure (Docker
# missing/down, no disk space). Soft warnings (no host Python, low disk)
# don't block — they just inform.
function Test-Prerequisites {
    Step 1 "Checking prerequisites"
    $hardFail = $false

    # ----- PowerShell version (already enforced by #Requires, but echo it)
    $psVer = $PSVersionTable.PSVersion
    OK ("PowerShell {0}.{1} (need 5.1+)" -f $psVer.Major, $psVer.Minor)

    # ----- Windows version — Docker Desktop needs Win10 1903+ for WSL2
    $os = [System.Environment]::OSVersion.Version
    if ($os.Major -ge 10) {
        OK ("Windows {0}.{1} build {2}" -f $os.Major, $os.Minor, $os.Build)
    } else {
        Warn "Windows version older than 10 — Docker Desktop may not run."
    }

    # ----- Docker CLI on PATH
    $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerExe) {
        Err "'docker' command not found on PATH."
        Write-Host "    Install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
        Write-Host "    After install, restart this terminal and re-run install.bat" -ForegroundColor Yellow
        $hardFail = $true
    } else {
        $dockerVer = (docker version --format '{{.Client.Version}}' 2>$null)
        if ($LASTEXITCODE -eq 0 -and $dockerVer) {
            OK "Docker CLI $dockerVer"
        } else {
            OK "Docker CLI detected"
        }
    }

    # ----- Docker daemon reachable (Docker Desktop actually running)
    if (-not $hardFail) {
        try {
            $serverVer = docker info --format '{{.ServerVersion}}' 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $serverVer) { throw "down" }
            OK "Docker daemon reachable (server $serverVer)"
        } catch {
            Err "Docker daemon NOT reachable — Docker Desktop probably isn't running."
            Write-Host "    Open Docker Desktop, wait for the whale icon to stop animating," -ForegroundColor Yellow
            Write-Host "    then re-run install.bat." -ForegroundColor Yellow
            $hardFail = $true
        }
    }

    # ----- WSL2 backend (Docker Desktop default on Win10/11)
    if (-not $hardFail) {
        $osType = docker info --format '{{.OSType}}/{{.OperatingSystem}}' 2>$null
        if ($osType -match "linux") {
            OK "Docker is using Linux containers (good)"
        } elseif ($osType) {
            Warn "Docker is in Windows-container mode. Switch to Linux containers:"
            Write-Host "    Right-click the Docker whale icon in the system tray," -ForegroundColor Yellow
            Write-Host "    pick 'Switch to Linux containers...', then re-run." -ForegroundColor Yellow
            $hardFail = $true
        }
    }

    # ----- Disk space — need ~3 GB free for first build (images + builds)
    try {
        $drive = (Get-Item $ProjectRoot).PSDrive.Name
        $free = (Get-PSDrive -Name $drive).Free
        $freeGB = [math]::Round($free / 1GB, 1)
        if ($freeGB -lt 3) {
            Warn "Only ${freeGB} GB free on ${drive}: — first build needs ~3 GB."
        } else {
            OK "${freeGB} GB free on ${drive}: drive"
        }
    } catch { Warn "Couldn't check disk space (continuing)." }

    # ----- Host Python — NOT required (OAuth runs inside the container),
    # but if it's present we mention it so users running scripts/*.py
    # outside Docker know they're set up. This is informational only —
    # the dashboard works fine without host Python.
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
    if ($py) {
        try {
            $pyVer = (& $py.Source --version 2>&1).ToString().Trim()
            OK "Host Python found: $pyVer  ($($py.Source))"
        } catch {
            OK "Host Python found at $($py.Source)"
        }
        Write-Host "    (Not required — the Schwab OAuth runs inside Docker.)" -ForegroundColor DarkGray
    } else {
        Warn "No host Python on PATH — that's FINE."
        Write-Host "    Schwab OAuth runs inside the Docker sidecar container," -ForegroundColor DarkGray
        Write-Host "    so the dashboard works without a Python install on Windows." -ForegroundColor DarkGray
    }

    # ----- Long-path support — Docker Desktop builds need long paths on
    # Windows. If LongPathsEnabled is 0, builds sometimes fail mysteriously.
    try {
        $lp = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -ErrorAction Stop
        if ($lp.LongPathsEnabled -eq 1) {
            OK "Windows long-path support enabled"
        } else {
            Warn "Windows long-path support is OFF — Docker builds may fail."
            Write-Host "    Fix (as Administrator):" -ForegroundColor Yellow
            Write-Host "      reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f" -ForegroundColor Yellow
        }
    } catch { Warn "Couldn't read long-path registry key (continuing)." }

    if ($hardFail) { return $false }
    return $true
}

# Kept for backward compat — old code paths called Test-DockerRunning.
function Test-DockerRunning { return Test-Prerequisites }

# ─────────────────── 2. .env setup ────────────────────────────────────
function Initialize-EnvFile {
    Step 2 "Setting up the .env file"
    if ((Test-Path ".env") -and (-not $ForceEnv)) {
        OK ".env already exists (keeping it — pass -ForceEnv to overwrite)"
        return $false  # don't re-prompt for creds
    }
    if (-not (Test-Path ".env.example")) {
        Err ".env.example is missing — this doesn't look like a valid project folder."
        Write-Host "    Expected: $ProjectRoot\.env.example" -ForegroundColor Yellow
        exit 1
    }
    Copy-Item ".env.example" ".env" -Force
    OK ".env created from template"
    return $true   # signal: do prompt for creds
}

# ─────────────────── 3. Credential prompt ─────────────────────────────
function Read-SchwabCredentials {
    Step 3 "Schwab API credentials"
    Write-Host ""
    Write-Host "  Two options:"
    Write-Host "    [1] Real-time Schwab data  (need API key + secret from"
    Write-Host "         https://developer.schwab.com)"
    Write-Host "    [2] Free Yahoo Finance     (15-minute delayed)"
    Write-Host ""

    if ($YahooOnly)        { Write-Host "  (-YahooOnly) — skipping prompt, using Yahoo"; return @{ Mode = "yahoo" } }
    if ($NonInteractive)   { Write-Host "  (-NonInteractive) — using Yahoo (no prompts allowed)"; return @{ Mode = "yahoo" } }

    do {
        $choice = Read-Host "  Choice [1/2, default 1]"
        if (-not $choice) { $choice = "1" }
    } while ($choice -notin @("1", "2"))

    if ($choice -eq "2") {
        return @{ Mode = "yahoo" }
    }

    Write-Host ""
    Write-Host "  Paste your Schwab API key (also called 'client_id'):"
    $apiKey = (Read-Host "  SCHWAB_API_KEY").Trim()
    while (-not $apiKey) {
        Warn "API key can't be empty."
        $apiKey = (Read-Host "  SCHWAB_API_KEY").Trim()
    }

    Write-Host ""
    Write-Host "  Paste your Schwab app secret (input is masked):"
    $secureSecret = Read-Host "  SCHWAB_APP_SECRET" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
    try {
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    while (-not $secret) {
        Warn "Secret can't be empty."
        $secureSecret = Read-Host "  SCHWAB_APP_SECRET" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
        try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim() }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }

    return @{ Mode = "schwab"; ApiKey = $apiKey; Secret = $secret }
}

# ─────────────────── 4. .env writer ────────────────────────────────────
# Line-by-line rewrite — avoids regex-escaping problems with secret values
# that contain characters like '$' or '\'.
function Set-EnvLine([string[]]$lines, [string]$key, [string]$value) {
    $found = $false
    $out = @()
    foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($key))\s*=") {
            $out += "$key=$value"
            $found = $true
        } else {
            $out += $line
        }
    }
    if (-not $found) { $out += "$key=$value" }
    return $out
}

function Update-EnvFile($creds) {
    $envPath = Join-Path $ProjectRoot ".env"
    $lines = Get-Content $envPath
    if ($creds.Mode -eq "schwab") {
        $lines = Set-EnvLine $lines "SCHWAB_API_KEY"    $creds.ApiKey
        $lines = Set-EnvLine $lines "SCHWAB_APP_SECRET" $creds.Secret
        $lines = Set-EnvLine $lines "SCHWAB_CALLBACK_URL" "https://127.0.0.1"
        $lines = Set-EnvLine $lines "DATA_SOURCE"        "schwab"
        OK ".env updated with Schwab credentials"
    } else {
        $lines = Set-EnvLine $lines "DATA_SOURCE" "yahoo"
        OK ".env set to Yahoo (delayed) mode"
    }
    Set-Content $envPath $lines -Encoding ASCII
}

# ─────────────────── 5. docker compose ─────────────────────────────────
function Start-Stack($creds) {
    Step 4 "Starting containers (first build can take 3-5 minutes)"
    Push-Location (Join-Path $ProjectRoot "mern")
    try {
        $args = @("compose", "--env-file", "..\.env")
        if ($creds.Mode -eq "schwab") { $args += @("--profile", "schwab") }
        $args += @("up", "-d", "--build")
        & docker @args
        if ($LASTEXITCODE -ne 0) {
            Err "docker compose failed (exit $LASTEXITCODE)."
            Err "Inspect the output above for the real cause."
            return $false
        }
        OK "Containers started"
        return $true
    } finally {
        Pop-Location
    }
}

# ─────────────────── 6. Health wait ────────────────────────────────────
function Wait-ForDashboard {
    Step 5 "Waiting for the dashboard to come online"
    $timeout = (Get-Date).AddMinutes(2)
    $dot = 0
    while ((Get-Date) -lt $timeout) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000" `
                -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) {
                Write-Host ""
                OK "Dashboard is responding"
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
            Write-Host -NoNewline "." -ForegroundColor DarkGray
            if ((++$dot % 30) -eq 0) { Write-Host "" }
        }
    }
    Write-Host ""
    Warn "Dashboard didn't respond within 2 minutes."
    Warn "Run 'docker compose ps' from the mern\ folder to inspect container state."
    return $false
}

function Open-Dashboard {
    Step 6 "Opening dashboard in your browser"
    Start-Process "http://localhost:3000"
    OK "Browser tab opened"
}

# ─────────────────── Main ──────────────────────────────────────────────
Write-Banner
if (-not (Test-DockerRunning)) {
    Write-Host ""
    Read-Host "Press Enter to close this window"
    exit 1
}
$envWasCreated = Initialize-EnvFile
$creds = if ($envWasCreated) { Read-SchwabCredentials } else {
    # Detect mode from existing .env so we know whether to start the
    # Schwab profile on re-runs.
    $envContent = Get-Content (Join-Path $ProjectRoot ".env") -Raw
    if ($envContent -match "(?m)^DATA_SOURCE\s*=\s*schwab" -and
        $envContent -match "(?m)^SCHWAB_API_KEY\s*=\s*\S+") {
        OK "Existing .env has Schwab credentials — will use real-time mode"
        @{ Mode = "schwab" }
    } else {
        OK "Existing .env is in Yahoo mode"
        @{ Mode = "yahoo" }
    }
}
if ($envWasCreated) { Update-EnvFile $creds }
if (-not (Start-Stack $creds)) {
    Read-Host "Press Enter to close this window"
    exit 1
}
$healthy = Wait-ForDashboard
if ($healthy) { Open-Dashboard }

# ─────────────────── Wrap-up ───────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Setup complete" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard:     http://localhost:3000"
Write-Host "  To stop:       double-click stop.bat"
Write-Host "  To start:      double-click start.bat   (no rebuild — faster)"
Write-Host "  To re-install: double-click install.bat (idempotent)"
if ($creds.Mode -eq "schwab") {
    Write-Host ""
    Write-Host "  Schwab OAuth: if the dashboard banner says 'Schwab token rejected',"
    Write-Host "                double-click auth-schwab.bat to complete the sign-in."
}
Write-Host ""
Read-Host "Press Enter to close this window"
