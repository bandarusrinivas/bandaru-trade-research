# Bandaru Trade Research — User Guide

A step-by-step manual for launching, using, and stopping the app on macOS and Windows.

> **Architecture deep-dive?** See [PRODUCT_GUIDE.md](PRODUCT_GUIDE.md).
> **Building or deploying?** See [BUILD.md](BUILD.md) and [DEPLOY.md](DEPLOY.md).

---

## Contents

1. [Pick a launch mode](#1-pick-a-launch-mode)
2. [First-time setup](#2-first-time-setup)
3. [Launch the app — Docker mode](#3-launch-the-app--docker-mode)
4. [Launch the app — Local mode (no Docker)](#4-launch-the-app--local-mode-no-docker)
5. [Launch the app — Auto mode](#5-launch-the-app--auto-mode)
6. [Stop the app](#6-stop-the-app)
7. [The dashboard at a glance](#7-the-dashboard-at-a-glance)
8. [Daily workflow](#8-daily-workflow)
9. [Switching data sources (Yahoo ↔ Schwab)](#9-switching-data-sources-yahoo--schwab)
10. [Common tasks](#10-common-tasks)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Pick a launch mode

Double-click `start.command` (Mac) or `start.bat` (Windows) at the project root. You'll see a menu — pick one of four modes:

| Choice | What runs | URL | Best for |
|---|---|---|---|
| 1 — **Docker** | Mongo + Express + nginx in containers (Yahoo data) | http://localhost:3000 | Daily use, persistent Trade Journal |
| 2 — **Docker + Schwab** | adds the Python data sidecar for real-time data | http://localhost:3000 | Trading hours, real-time signals |
| 3 — **Local Node** | Express + Vite with your installed Node (Yahoo data) | http://localhost:5173 | No Docker, hot-reload, fast iteration |
| 4 — **Python (Schwab)** | legacy Flask app, no Docker (real-time) | http://127.0.0.1:5000 | Real-time data without containers |

The menu launcher delegates to the matching script in `scripts/mac/` or `scripts/windows/`. You can also call those directly (e.g. `scripts/mac/start-docker.command`) if you want one-click access to a specific mode.

**Trade Journal availability:**
- Choices 1 & 2 (Docker) → always on (MongoDB ships in the stack).
- Choice 3 (Local Node) → on if you have MongoDB running on `localhost:27017`, off otherwise. Everything else still works.
- Choice 4 (Python) → stored in browser localStorage (not persistent across browsers/devices).

---

## 2. First-time setup

Do this once. After that, you only need the launch and stop steps.

### 2a. Clone (or download) the repo

**Option A — git clone:**

```bash
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research
```

**Option B — download ZIP:**

1. Visit https://github.com/bandarusrinivas/bandaru-trade-research
2. Click the green **Code** button → **Download ZIP**
3. Extract it anywhere on your computer
4. Open the extracted folder

### 2b. Install prerequisites for your chosen mode

**For Docker mode:**
- Install **Docker Desktop** from https://www.docker.com/products/docker-desktop/ (free, open source). Mac and Windows both supported.
- Launch Docker Desktop once after install — wait for the whale icon to be steady.

**For Local mode:**
- Install **Node.js 20+ LTS** from https://nodejs.org. On Mac you can also use `brew install node`.
- Verify: open a terminal and run `node -v`. It should print `v20.x.x` or higher.

You only need one of the two. Auto mode picks whichever is available.

### 2c. Make the Mac scripts executable (Mac only, first run)

Mac normally trusts double-clicks from Finder, but if you cloned via terminal the executable bit may not be set. Fix once:

```bash
cd bandaru-trade-research
chmod +x *.command
```

Windows scripts (`.bat` and `.ps1`) need no setup.

---

## 3. Launch the app — Docker mode

This is the recommended mode for daily use. It boots the full stack with MongoDB, so your Trade Journal persists across restarts.

### macOS — step by step

1. Open **Finder** → navigate to the `bandaru-trade-research` folder.
2. Double-click **`start-docker.command`**.
3. A Terminal window opens. The script:
   - Verifies Docker is installed and running.
   - Runs `docker compose up -d --build` in `mern/`.
   - First time: downloads `node:20-alpine`, `nginx:alpine`, `mongo:7` images (~300 MB total) and builds the server + client images. Takes 2–4 minutes the very first time, ~10 seconds after that.
4. When the script prints **"Stack is up. Opening http://localhost:3000"**, your default browser opens automatically to the dashboard.
5. If the browser doesn't open, manually visit **http://localhost:3000**.

**First-run security prompt:** macOS Gatekeeper may say "cannot be opened because it is from an unidentified developer". To bypass once:
- Right-click `start-docker.command` → **Open** → click **Open** in the dialog.
- From then on, double-clicking works normally.

### Windows — step by step

1. Open **File Explorer** → navigate to the `bandaru-trade-research` folder.
2. Double-click **`start-docker.bat`** (or right-click `start-docker.ps1` → **Run with PowerShell**).
3. A Command Prompt window opens. The script:
   - Verifies Docker is installed and the daemon is running.
   - Runs `docker compose up -d --build` in `mern\`.
   - Pulls images and builds — same timing as Mac.
4. When the script prints **"Stack is up. Opening http://localhost:3000"**, your default browser opens to the dashboard.
5. If the browser doesn't open, manually visit **http://localhost:3000**.

**First-run security prompt:** Windows SmartScreen may say "Windows protected your PC". To bypass once:
- Click **More info** → **Run anyway**.

**PowerShell execution-policy error?** Open Command Prompt and run:

```bat
powershell -ExecutionPolicy Bypass -File start-docker.ps1
```

### What's running after Docker launch

Three containers, all named with the `bandaru-` prefix:

| Container | Image | Port | Purpose |
|---|---|---|---|
| `bandaru-mongo` | `mongo:7` | 27017 (internal) | Persistent Trade Journal storage |
| `bandaru-server` | local build | 4000 (internal) | Express API — pivots, indicators, screener |
| `bandaru-client` | local build | 3000 → host | nginx serving React SPA + `/api/*` proxy |

Check anytime with: `cd mern && docker compose ps`.

---

## 4. Launch the app — Local mode (no Docker)

Use this if you don't want to install Docker, or you're actively editing the code and want Vite hot reload.

### macOS — step by step

1. Open Finder → `bandaru-trade-research`.
2. Double-click **`start-local.command`**.
3. A Terminal window opens. The script:
   - Verifies Node 18+ is installed.
   - Runs `npm install` in `mern/server` and `mern/client` if `node_modules` is missing (~30 seconds first time, skipped after).
   - Probes `127.0.0.1:27017` — if a MongoDB is running there, the Trade Journal is enabled; otherwise the server boots with the Journal disabled (everything else still works).
   - Starts Express on port 4000 in the background.
   - Starts Vite dev server on port 5173 in the background.
   - Waits for Vite to respond, then opens **http://localhost:5173** in your browser.
4. Logs go to `/tmp/bandaru-server.log` and `/tmp/bandaru-client.log`. Tail them with `tail -f /tmp/bandaru-server.log` if needed.

### Windows — step by step

1. Open File Explorer → `bandaru-trade-research`.
2. Double-click **`start-local.bat`** (or right-click `start-local.ps1` → **Run with PowerShell**).
3. A Command Prompt window opens. The script:
   - Verifies Node 18+ is installed.
   - Runs `npm install` if needed.
   - Probes `127.0.0.1:27017` for an optional MongoDB.
   - Launches Express and Vite in minimized child Command Prompts titled "Bandaru Server" and "Bandaru Client".
   - Opens **http://localhost:5173** in your default browser.
4. Logs go to `%TEMP%\bandaru-server.log` and `%TEMP%\bandaru-client.log`. Type `notepad %TEMP%\bandaru-server.log` to view.

### Enabling the Trade Journal in Local mode (optional)

If you want the Trade Journal to persist in Local mode, run a local MongoDB on port 27017. The fastest way is via Docker:

```bash
docker run -d --name bandaru-mongo -p 27017:27017 mongo:7
```

Or install MongoDB Community Edition natively from https://www.mongodb.com/try/download/community. Restart the launcher after Mongo is up — the script auto-detects it.

---

## 5. Launch the app — Auto mode

The simplest option: one launcher that picks for you.

### macOS — step by step

1. Open Finder → `bandaru-trade-research`.
2. Double-click **`start.command`**.
3. The script checks Docker first:
   - **Docker running** → behaves like `start-docker.command`, opens http://localhost:3000.
   - **Docker missing or stopped** → falls back to local Node mode, opens http://localhost:5173.

### Windows — step by step

1. Open File Explorer → `bandaru-trade-research`.
2. Double-click **`start.bat`** (or run `start.ps1` in PowerShell).
3. Same auto-pick logic — Docker first, Node fallback.

---

## 6. Stop the app

One stop script handles all three modes. It tears down whatever happens to be running.

### macOS

1. Open Finder → `bandaru-trade-research`.
2. Double-click **`stop.command`**.
3. The script:
   - Runs `docker compose down` if the Docker stack is up.
   - Kills the Express and Vite child processes recorded by the local launcher (PIDs stored in `/tmp/bandaru.pids`).
   - Sweeps anything still listening on ports 4000 and 5173 as a safety net.
4. When the Terminal window prints **"✓ Stopped."**, you can close it.

### Windows

1. Open File Explorer → `bandaru-trade-research`.
2. Double-click **`stop.bat`** (or run `stop.ps1` in PowerShell).
3. Same teardown logic — Docker stack down, Node processes killed, ports 4000/5173 cleared.
4. The script prints **"Stopped."** and pauses for you to read; press Enter to close.

### Manual stop (if the script can't reach the process)

**Docker mode:**

```bash
cd bandaru-trade-research/mern
docker compose down            # graceful shutdown
docker compose down -v         # also wipes the MongoDB volume (Trade Journal erased)
```

**Local mode — Mac:**

```bash
lsof -ti :4000 | xargs kill    # kill whatever is on the Express port
lsof -ti :5173 | xargs kill    # kill whatever is on the Vite port
```

**Local mode — Windows (Command Prompt as admin):**

```bat
for /f "tokens=5" %a in ('netstat -ano ^| findstr :4000') do taskkill /F /PID %a
for /f "tokens=5" %a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %a
```

---

## 7. The dashboard at a glance

After launch, the browser opens to a dashboard with seven tabs:

| Tab | What it shows |
|---|---|
| 📊 **Chart Analysis** | Multi-pane HTML5 candle chart — price + EMA 8/21/50 + pivot S/R + buy/sell arrows + volume + MACD. Heikin-Ashi default, mouse-wheel zoom. |
| 🚨 **Entry / Exit Alerts** | Pivot levels + suggested 0DTE option trades (Bull Call Break / Bear Put Break) with status badges and reasoning. |
| 🎯 **Pro Signals** | Stacked EMA, ADX trend strength, MACD, RSI — all daily timeframe. |
| 👀 **Watchlist** | Multi-symbol live quote tiles. Click any tile to switch the whole dashboard to that ticker. |
| 🔍 **Screener** | Parallel-scan a list of tickers for entry opportunities, sorted by signal strength. Click a row to switch tickers. |
| 📒 **Trade Journal** | Persistent log of opened and closed trades with calculated P&L. Backed by MongoDB in Docker mode. |
| ⛓ **Options Chain** | ±2% strikes around ATM, calls on the left, puts on the right, with bid / ask / IV / OI / volume. |

Above the tabs: brand, ticker picker (SPY/QQQ/IWM/NVDA/TSLA/AAPL presets plus free-text), live SPY quote, Master Verdict banner (BULLISH / BEARISH / MIXED with a GO LONG / GO SHORT action button). Below the tabs: footer with version chip and license.

Auto-refresh: every **10 seconds** for all data. No manual refresh needed.

---

## 8. Daily workflow

### Morning — start the session

1. Make sure Docker Desktop is running (Docker mode) or that Node is installed (Local mode).
2. Double-click your preferred launcher (`start-docker.command` / `.bat` / `.ps1` or `start-local.*`).
3. Wait ~30 seconds for the browser to open.
4. The dashboard reloads the last ticker you used (saved in browser `localStorage`).

### During the trading day

Switch tickers by typing a symbol in the header, or clicking a preset like QQQ. The whole dashboard re-points to the new ticker.

Find opportunities across many tickers by clicking **🔍 Screener**, keeping or editing the default list, then clicking "Scan". Results sort by signal strength — click any row to switch the dashboard to that ticker.

Watch a few key symbols using **👀 Watchlist**. Add or remove with the input field plus the ✕ buttons. Click any tile to make that ticker the active one.

Log a trade by clicking **📒 Trade Journal**, filling the form, and submitting. The trade appears in the Open table immediately and is persisted to MongoDB if it's running.

Close a trade by clicking **Close** on its row and entering the exit premium. It moves to the Closed table with the P&L calculated for you.

Reading the chart: green candles are bullish bars, pink are bearish. Cyan / blue / coral lines are EMA 8 / 21 / 50. Dotted lines are pivot S/R levels (white PP, coral R levels, green S levels). A green ▲ below a bar marks a bullish EMA-cross trigger; a pink ▼ above marks bearish.

### End of day

1. Double-click `stop.command` (Mac) or `stop.bat` / `stop.ps1` (Windows).
2. Wait for "Stopped." and close the terminal window.
3. Tomorrow morning, double-click `start-docker.command` / `start-local.command` again — same data is still there (Docker mode preserves the MongoDB volume across restarts).

---

## 9. Switching data sources (Yahoo ↔ Schwab)

The app uses **Yahoo Finance by default** — free, no signup, ~15-minute delayed.

To switch to **Schwab API** (free, real-time, requires a Schwab brokerage account plus a free developer app):

1. Sign up for an **Individual Developer** account at https://developer.schwab.com.
2. Create an app — set Callback URL to `https://127.0.0.1`. Wait 1–3 business days for Schwab to approve it.
3. Copy your App Key and App Secret into `mern/.env`:

   ```env
   DATA_SOURCE=schwab
   SCHWAB_API_KEY=...
   SCHWAB_APP_SECRET=...
   ```

4. Restart the app: double-click `stop.command` then `start-docker.command` (or your preferred launcher).

> **Status note:** Schwab support in the MERN server is currently stubbed — Yahoo Finance is the actively-supported source. The legacy Python implementation at `legacy-python/` has full Schwab support if you need real-time data today. See [CHANGELOG.md](CHANGELOG.md) for Schwab-in-MERN progress.

---

## 10. Common tasks

### Update to the latest version

```bash
cd bandaru-trade-research
git pull
```

Then re-launch via the script. In Docker mode, the launcher uses `--build`, so it picks up code changes automatically. In Local mode, restart the launcher to pick up server changes; Vite hot-reloads the client.

### Wipe local data and start fresh (Docker mode)

```bash
cd bandaru-trade-research/mern
docker compose down -v          # -v removes the MongoDB volume
```

Then re-launch. Trade Journal will be empty.

### Run on a different port (Docker mode)

Edit `mern/docker-compose.yml`:

```yaml
client:
  ports:
    - "8080:80"     # was "3000:80"
```

Re-launch. Dashboard now at **http://localhost:8080**.

### View live logs

Docker mode:

```bash
cd bandaru-trade-research/mern
docker compose logs -f                  # all services
docker compose logs -f server           # server only
```

Local mode — Mac:

```bash
tail -f /tmp/bandaru-server.log
tail -f /tmp/bandaru-client.log
```

Local mode — Windows:

```bat
type %TEMP%\bandaru-server.log
type %TEMP%\bandaru-client.log
```

### Check what's running (Docker)

```bash
cd bandaru-trade-research/mern
docker compose ps
```

### Restart just the server after a code change (Docker)

```bash
docker compose up -d --build server
```

---

## 11. Troubleshooting

| Symptom | Cause + fix |
|---|---|
| `docker: command not found` (Docker mode) | Docker Desktop isn't installed. Install from https://docker.com. |
| "Docker is installed but the daemon isn't running" | Open Docker Desktop, wait for the whale icon to stop animating, then re-run the launcher. |
| Port 3000 already in use | Something else is on it. Either stop that service, or change the port in `mern/docker-compose.yml` (see "Run on a different port"). |
| Dashboard shows "Loading…" forever | Server can't reach Yahoo Finance. Check `docker compose logs server` — usually a rate-limit. Wait 60s and refresh. |
| `npm install` fails (Local mode) | Node version too old. Run `node -v` — needs 18+. Install latest LTS from https://nodejs.org. |
| Trade Journal disappears between launches | You ran `docker compose down -v` somewhere — the `-v` flag wipes the MongoDB volume. Use plain `docker compose down` (or `stop.command`) to preserve data. |
| macOS: "cannot be opened because it is from an unidentified developer" | Gatekeeper. Right-click the `.command` script → **Open** → **Open**. Only needed once per script. |
| Windows: SmartScreen blocks `.ps1` | Click **More info** → **Run anyway**. Or use the matching `.bat`. Or run `powershell -ExecutionPolicy Bypass -File start-docker.ps1`. |
| Local mode: "Cannot connect to MongoDB" warnings | Expected if no Mongo on :27017 — the Journal is just disabled. To enable it: `docker run -d --name bandaru-mongo -p 27017:27017 mongo:7`. |
| Schwab "token_invalid" error | Schwab support is stubbed in MERN. Use Yahoo for now, or run the legacy Python version for full Schwab support. |
| Launcher window closes immediately | Right-click the script → open with a terminal manually so you can read the error, or check the log file paths the script prints. |

For deeper issues, file an issue at https://github.com/bandarusrinivas/bandaru-trade-research/issues with the relevant log output attached (`docker compose logs` for Docker mode, `/tmp/bandaru-*.log` or `%TEMP%\bandaru-*.log` for Local mode).

---

*Last updated: v2.0.0 · See [CHANGELOG.md](CHANGELOG.md) for version history.*
