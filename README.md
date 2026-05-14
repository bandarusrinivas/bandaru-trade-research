# Bandaru Trade Research

**Version 1.0.0** · [Changelog](CHANGELOG.md) · [Product Guide](PRODUCT_GUIDE.md) · [Build](BUILD.md)

Day-trading analysis dashboard for SPY 0DTE options. Real-time pivots, S/R levels, option-chain levels (Max Pain, top OI/Volume), TTM Squeeze, MACD, ADX, Heikin-Ashi candles, and a Master Verdict synthesis (BULLISH / BEARISH / MIXED).

Runs locally as a Flask web app. Auto-refreshes every 2–30 seconds. Works with Schwab API (real-time) or Yahoo Finance (delayed) — no broker account required to demo it.

---

## Features

- **Multi-tab dashboard**: Chart Analysis · Entry/Exit Alerts · Pro Signals · Watchlist · Trade Journal · Options Chain
- **Native HTML5 canvas chart** (no TradingView dependency) with pivots, EMAs, MACD, TTM Squeeze, Smooth Heikin-Ashi, day partitions, and zoom
- **3D view by default** — yesterday + today + tomorrow's projected session
- **Buy/sell arrows** on EMA 8/21 crossovers
- **Option-chain overlay levels** — Max Pain, top Call/Put OI, top Call/Put Volume
- **GO / READY / STANDBY / INVALID** status badges on every suggested 0DTE trade
- **Configurable refresh** — 2s / 5s / 10s / 30s, persists across sessions
- **Universal ticker picker** — SPY, QQQ, IWM, NVDA, TSLA, AAPL, or any symbol
- **Trade Journal** with CSV export
- **Automatic Schwab→Yahoo fallback** if token expires

## Screenshots

(Add screenshots here once you've taken them — drop them into a `docs/` folder.)

---

## System requirements

### Hardware

| Resource | Minimum | Recommended |
|---|---|---|
| **CPU** | Intel/AMD x64 OR Apple Silicon (M1/M2/M3) | Any modern multi-core |
| **RAM** | 4 GB free | 8 GB+ free |
| **Disk space** | 500 MB for source install, 1 GB for pre-built bundle | 2 GB |
| **Display** | 1280×800 | 1920×1080+ (the chart uses width well) |
| **Internet** | Always-on broadband (required for market data) | — |

### Operating systems

| OS | Version | Path A (pre-built) | Path B (ZIP) | Path C (git clone) |
|---|---|---|---|---|
| **macOS** | 11 Big Sur or newer (Intel + Apple Silicon) | ✓ | ✓ | ✓ |
| **Windows** | 10 1809+ or Windows 11 | ✓ | ✓ | ✓ |
| **Linux** | Ubuntu 22.04+ / Fedora 38+ / similar | build from source | ✓ | ✓ |

### Software prerequisites

What you need installed **depends on which install path** you use:

#### Path A — Pre-built app (`.app` / `.exe` from Releases)

**Nothing extra to install.** The bundle includes Python + Flask + every dependency. Just need:

- A modern browser (Safari, Chrome, Firefox, Edge) — already on every OS
- Network access for market data

#### Path B — Download ZIP (run from source, no git)

| Tool | Required version | Used for | How to check | If missing |
|---|---|---|---|---|
| **Python** | 3.10 or newer (3.12 ideal) | Runs the Flask backend + indicator math | `python3 --version` (Mac) or `python --version` (Windows) | [python.org/downloads](https://www.python.org/downloads/) — Windows: tick "Add Python to PATH" during install |
| **pip** | Bundled with Python ≥ 3.4 | Installs Python packages | `pip --version` | Reinstall Python |
| **Web browser** | Any modern version | Renders the dashboard | Safari/Chrome/Firefox/Edge all work | n/a |

That's the whole list. Setup creates a `.venv` and installs the rest automatically.

#### Path C — git clone (development setup)

Adds these on top of Path B's requirements:

| Tool | Required version | Used for | How to check | If missing |
|---|---|---|---|---|
| **git** | 2.20+ | Clone + sync source code | `git --version` | macOS: `xcode-select --install` · Windows: [git-scm.com/download/win](https://git-scm.com/download/win) |
| **Homebrew** (macOS only, recommended) | latest | Installs Python, gh CLI, etc. | `brew --version` | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| **winget** (Windows 10/11) | latest | Installs gh CLI | `winget --version` | Bundled with Windows 11 — update Windows |
| **GitHub CLI (`gh`)** | 2.0+ | Push code to GitHub via browser auth | `gh --version` | The push script installs it automatically |
| **PyInstaller** | 6.0+ | Build standalone `.app` / `.exe` | `pyinstaller --version` | `pip install pyinstaller` — the build script auto-installs |

### Optional — for real-time Schwab data

If you want **real-time quotes + true Greeks** (instead of Yahoo's 15-min delayed data):

| Requirement | How to get it | Cost |
|---|---|---|
| **Schwab brokerage account** | Open at [schwab.com](https://www.schwab.com) | Free |
| **Schwab Individual Developer account** | Sign up at [developer.schwab.com](https://developer.schwab.com) | Free |
| **An approved Schwab developer app** | Submit form on dev portal — set Callback URL to `https://127.0.0.1`. Approval takes 1–3 business days. | Free |
| **App Key + App Secret** | Copied from your approved app's settings into `.env` | Free |

The Yahoo Finance fallback works out of the box with no account, no API key, no setup — useful for evaluating the platform before applying for Schwab.

### Network requirements

The dashboard fetches data from a few external endpoints. If you're on a corporate or school network, make sure these are reachable:

| Service | Domain | Used for |
|---|---|---|
| Yahoo Finance | `query1.finance.yahoo.com`, `query2.finance.yahoo.com` | Quotes, options chains (when on Yahoo source) |
| Schwab API | `api.schwabapi.com` | Quotes, options chains (when authenticated) |
| Schwab OAuth | `api.schwabapi.com/v1/oauth/authorize` | One-time auth flow |
| GitHub (for updates / push) | `github.com`, `api.github.com` | Code distribution |
| Homebrew / PyPI / winget | `formulae.brew.sh`, `pypi.org`, `winget.azureedge.net` | Dependency installs (one-time during setup) |

Also need the **local port `5000`** (or 5001 / 5002 — the launcher auto-picks) free on `127.0.0.1`. The launcher tries 5000 first; if your machine has something else listening there (Docker, AirPlay receiver on Mac, IIS on Windows), it falls through to 5001 / 5002 automatically.

#### Known network gotchas

- **Chrome on managed profiles** (corporate / school like Prosper ISD) sometimes blocks `localhost`. The included `start-app.command` opens Safari automatically as a workaround on macOS. On Windows, the `.bat` opens Edge.
- **macOS AirPlay Receiver** uses port 5000 by default. Either disable it in **System Settings → General → AirDrop & Handoff → AirPlay Receiver off**, or let the launcher pick port 5001 (it does this automatically).
- **Corporate proxies / firewalls** may block `api.schwabapi.com` or Yahoo. Whitelist those domains, or run from a personal network.

---

## Quick start — three install paths

Pick the one that matches your setup:

### Path A — Pre-built app (easiest, no Python or git needed)

For users who just want to **run** the app, not develop it:

1. Go to the [Releases page](https://github.com/bandarusrinivas/bandaru-trade-research/releases/latest)
2. Download the file for your platform:
   - **macOS**: `BandaruTradeResearch-macOS.zip` — contains `Bandaru Trade Research.app`
   - **Windows**: `BandaruTradeResearch-Windows.zip` — contains `Bandaru Trade Research.exe`
3. **macOS**: unzip → drag the `.app` to Applications → right-click → **Open** (first time only, to bypass the "unsigned developer" warning)
4. **Windows**: unzip to any folder → double-click `Bandaru Trade Research.exe` → click **More info → Run anyway** at the SmartScreen warning (first time only)
5. Your default browser opens automatically to `http://127.0.0.1:5000`. Done.

No Python, no git, no Terminal needed. The bundled app includes Python + Flask + all dependencies.

### Path B — Download as ZIP (no git required)

If you want the **source code** but don't have git installed:

1. Go to the [repository](https://github.com/bandarusrinivas/bandaru-trade-research)
2. Click the green **Code** button → **Download ZIP**
3. Save and **unzip** to a permanent location (e.g., `~/Documents/bandaru-trade-research/`)
4. **One-time setup** — requires Python 3.10+ (download from [python.org](https://www.python.org/downloads/) if missing):

   **macOS** (in Terminal):
   ```bash
   cd ~/Documents/bandaru-trade-research
   chmod +x setup.command start-app.command
   ./setup.command
   ```
   Or just double-click `setup.command` in Finder (right-click → Open the first time to bypass Gatekeeper).

   **Windows** (in Command Prompt or PowerShell):
   ```bat
   cd C:\Users\<YourName>\Documents\bandaru-trade-research
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

5. **Launch the app**:
   - **macOS**: double-click `start-app.command`
   - **Windows**: in Command Prompt, run `python launcher.py`

### Path C — Clone with git (for developers)

If you have git installed and want to contribute / track updates:

```bash
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research
./setup.command          # one-time: creates .venv, installs deps
./start-app.command      # launches Flask + opens browser
```

Pull updates later with `git pull`. If you also want to build cross-platform distributables, see [BUILD.md](BUILD.md).

---

## Build a standalone app (for distribution)

If you've cloned the repo and want to produce a `.app` or `.exe`:

```bash
# macOS:
./build-mac.command       # → dist/Bandaru Trade Research.app

# Windows:
build-windows.bat         # → dist\Bandaru Trade Research\*.exe
```

See [BUILD.md](BUILD.md) for full distribution + code-signing guide.

---

## Command-line interface

The `bandaru` CLI gives one-liner control over the app:

```bash
bandaru start             # boot dashboard (defaults to Schwab; falls back to Yahoo)
bandaru start yahoo       # force Yahoo (no auth needed)
bandaru stop              # stop server, keep terminals open
bandaru exit              # full cleanup: stop + close Safari tabs + close terminals
bandaru status            # show server state + data source + token freshness
bandaru auth              # re-run Schwab OAuth (auto-flow, no copy/paste)
```

Install: double-click `install-bandaru-cli.command` once. Adds `~/bin/bandaru` to PATH.

---

## Data sources

Set `DATA_SOURCE` in `.env`:

| Value | What you get | Setup needed |
|---|---|---|
| `schwab` (default) | Real-time quotes, full Greeks | One-time OAuth via `bandaru auth` |
| `yahoo` | ~15-min delayed, approximated Greeks | None |
| `demo` | Synthetic data | None (great for UI testing) |

The app auto-falls-back to Yahoo if the Schwab token is missing or expired.

---

## Market data setup — Yahoo (default) vs Schwab (preferred)

The app runs with **Yahoo Finance out of the box** — no signup, no API key, no token. Just install and launch. Quotes are ~15 minutes delayed and Greeks are approximated.

**Schwab is preferred** because it gives **real-time quotes** and **true Black-Scholes Greeks** from the broker's own option chain. The trade-off is a one-time setup (free, but Schwab takes 1–3 business days to approve developer apps).

### Switching from Yahoo → Schwab

#### Step 1 — Get Schwab developer credentials (one-time, free)

1. Open a Schwab brokerage account at [schwab.com](https://www.schwab.com) (if you don't already have one)
2. Sign up for a free **Individual Developer** account at [developer.schwab.com](https://developer.schwab.com)
3. Create a new app on the dev portal:
   - **App Name**: anything (e.g., "Bandaru Trade Research")
   - **API Products**: ✓ Accounts and Trading Production · ✓ Market Data Production
   - **Callback URL**: `https://127.0.0.1` (exactly — no trailing slash, no port)
   - **Order Limit per minute**: leave at default 120
4. **Wait 1–3 business days** for the app to flip from "Pending" to "Ready for Use"
5. Once approved, copy the **App Key** (Client ID) and **App Secret** from the app's detail page

#### Step 2 — Put credentials in `.env`

Edit the `.env` file in your project folder (create it from `.env.example` if missing):

```
SCHWAB_API_KEY=your_app_key_here
SCHWAB_APP_SECRET=your_app_secret_here
SCHWAB_CALLBACK_URL=https://127.0.0.1
SCHWAB_TOKEN_PATH=./schwab_token.json
DATA_SOURCE=schwab
```

The `DATA_SOURCE=schwab` line is what tells the app to prefer Schwab over Yahoo.

#### Step 3 — Mint the OAuth token (one-time per 7 days)

Pick one of these:

**A. CLI** (if `bandaru` is installed in your PATH):
```bash
bandaru auth
```

**B. Double-click** in Finder / File Explorer:
- macOS: `auth-schwab.command`
- Both platforms: re-running `start-app.command` will auto-detect the missing token and run OAuth automatically

**C. Direct Python**:
```bash
python schwab_oauth.py
```

What happens during OAuth:
1. Safari (or your default browser) opens to Schwab's login page
2. You log in with your **Schwab brokerage** account (NOT the developer-portal credentials)
3. Complete 2FA if Schwab asks
4. Click **Allow** when Schwab asks "Authorize this app to access your account?"
5. Browser redirects to `https://127.0.0.1/?code=...` — page shows "Can't connect" (expected — there's no real server there)
6. The script reads the redirect URL **automatically from Safari** via AppleScript (no copy/paste required)
7. Exchanges the code for a token and saves `schwab_token.json` in the project folder
8. Smoke-tests with a SPY quote — prints `✓ SUCCESS — SPY last price: $XXX.XX`

### Token lifetime + refresh

- **Refresh tokens last 7 days.** During those 7 days, `schwab_token.json` auto-renews on every API call — no action needed.
- **After 7 days**, the next call returns `token_invalid` and the app auto-falls-back to Yahoo. You'll see this banner on the **Entry/Exit Alerts** tab: "Options data unavailable: token expired".
- **To refresh**, just re-run any of the OAuth options above (A, B, or C). New token, another 7 days. Old `schwab_token.json` is overwritten.

### Verifying which data source is active

| Method | What you'll see |
|---|---|
| **Top banner** at the dashboard launch | "Bandaru Trade Research — LIVE (schwab)" vs "LIVE (yahoo)" in the Terminal output |
| **`/api/version` endpoint** | `curl http://127.0.0.1:5000/api/version` returns `{"data_source": "schwab", ...}` |
| **`/api/analysis` response** | The `active_source` field reads `"schwab"`, `"yahoo"`, or `"yahoo (Schwab fallback)"` |
| **`bandaru status`** CLI | Shows token age in days/hours and whether server is running |

### Switching back to Yahoo

You don't need to delete anything — just flip the `.env` setting:

```
DATA_SOURCE=yahoo
```

Then **stop and restart** the app (`bandaru stop && bandaru start`, or use the launcher scripts). Yahoo will be used for all calls, the `schwab_token.json` stays on disk (safe to leave it).

### Common token issues

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard shows "Error: token_invalid" | Token expired (>7 days old) | Re-run `bandaru auth` |
| OAuth fails: "Bad authorization code: Unable to decrypt" | Code expired (>30s between Schwab redirect and paste) OR wrong App Secret in `.env` | Re-run OAuth — code is regenerated each round |
| OAuth fails: "redirect_uri mismatch" | Callback URL in `.env` ≠ what you set on developer.schwab.com | Match them exactly (case + trailing slash) |
| App keeps falling back to Yahoo silently | App auto-falls-back on any Schwab error to keep the dashboard alive | Check Terminal log for `[FALLBACK]` messages to see why |
| `RedirectServerExitedError: callback URL without a port` | Old version using `client_from_login_flow` | Updated code uses `client_from_manual_flow`, which works with port-less URLs — make sure `schwab_oauth.py` is present |

### Security notes

- **Never commit `.env` or `schwab_token.json`** — both are in `.gitignore` by default
- **Rotate the App Secret** in the developer portal if you've shared it (e.g., pasted in a chat). Sign in → Apps → Regenerate Secret → update `.env` → re-run `bandaru auth`
- The token file is readable only by your user account (`chmod 0600` enforced)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Safari/Chrome/Firefox)                    │
│  - HTML5 canvas chart                               │
│  - Pivots, EMAs, MACD, TTM Squeeze                 │
│  - Auto-refresh polling                             │
└────────────────────┬────────────────────────────────┘
                     │ HTTP (JSON)
                     ▼
┌─────────────────────────────────────────────────────┐
│  Flask backend (app.py)                             │
│  - /api/analysis  → quotes + pivots + recs + Greeks│
│  - /api/candles   → OHLCV bars for chart           │
│  - /api/chain     → option chain                    │
│  - /api/watchlist → multi-symbol quotes             │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐
   │ Schwab  │  │ yfinance │  │  Demo    │
   │ (real-  │  │ (15-min  │  │ (synth)  │
   │  time)  │  │ delayed) │  │          │
   └─────────┘  └──────────┘  └──────────┘
```

Indicators (Wilder's ADX, MACD 12/26/9, RSI, Bollinger, Keltner for TTM Squeeze, Heikin-Ashi, Smooth HA) are computed in `indicators.py` and `pro_indicators.py`. Black-Scholes Greeks in `greeks.py`. Pivot points, market stats, and recommendation logic in `analysis.py`.

---

## Project structure

```
├─ app.py                 # Flask routes
├─ analysis.py            # Pivots, market stats, trade recommendations
├─ indicators.py          # RSI, MACD, ADX, EMAs, Master Verdict
├─ pro_indicators.py      # TTM Squeeze, overnight HL, volume confirmation
├─ greeks.py              # Black-Scholes Δ Γ Θ ν
├─ schwab_client.py       # Schwab API wrapper
├─ yahoo_client.py        # yfinance-backed fallback
├─ demo_client.py         # Synthetic data for testing
├─ schwab_oauth.py        # Auto-flow OAuth (reads URL from Safari)
├─ launcher.py            # PyInstaller entry point
├─ bandaru                # Unified CLI (start/stop/exit/status/auth)
├─ bandaru.spec           # PyInstaller build spec
├─ templates/             # Jinja2 HTML
├─ static/
│  ├─ css/style.css
│  └─ js/
│     ├─ chart.js         # Canvas chart + zoom + pan + day partitions
│     └─ app.js           # Tabs + verdict + alerts + trade journal
├─ tests/                 # 120-check test suite
└─ *.command, *.bat       # Mac/Windows one-click launchers
```

---

## Educational use only

This is a personal analysis tool. **Not financial advice.** Day trading 0DTE options carries substantial risk of total loss. Premium projections use a simple delta × move approximation and aren't a guarantee of P&L. Verify all signals independently before placing trades.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Author

[bandarusrinivas](https://github.com/bandarusrinivas)
