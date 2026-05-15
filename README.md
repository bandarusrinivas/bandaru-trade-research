# Bandaru Trade Research

**Version 2.0.0** · MERN stack · Open source (MIT) · Docker-portable

Day-trading research dashboard for SPY 0DTE options. Real-time pivots, S/R levels, option-chain analysis, TTM Squeeze, MACD, ADX, Heikin-Ashi candles, stock screener, multi-symbol watchlist, and persistent MongoDB-backed trade journal.

The platform is built on the **MERN stack** (MongoDB + Express + React + Node.js) and shipped as a **Docker Compose** application — runs identically on macOS, Windows, Linux, or any cloud.

---

## Run it

### Easiest — double-click `start`

The project root has one launcher per platform that opens an interactive menu and runs the mode you pick.

| Platform | Start | Stop |
|---|---|---|
| **macOS** | `start.command` | `stop.command` |
| **Windows** | `start.bat` (or `start.ps1`) | `stop.bat` (or `stop.ps1`) |

When you run `start`, you'll see:

```
  1)  Docker            — Mongo + Express + nginx     (Yahoo data)
  2)  Docker + Schwab   — adds real-time data sidecar (requires token)
  3)  Local Node        — Express + Vite, no Docker   (Yahoo data)
  4)  Python (Schwab)   — legacy Flask app            (real-time, no Docker)
```

Each option delegates to the matching script in `scripts/mac/` or `scripts/windows/` — you can also run those directly if you prefer skipping the menu.

**Common one-off scripts at the root:**
- `auth-schwab.command` / `.bat` — interactive Schwab OAuth (before option 2 or 4)
- `push-to-github.command` / `.bat` — staged commit + push
- `cleanup.command` / `.bat` — run once after pulling the new layout to delete the old deprecation stubs

**First-run warnings:**
- macOS Gatekeeper may block unsigned scripts. Right-click → Open the first time.
- Windows SmartScreen may warn about `.ps1`. Click "More info" → "Run anyway", or use the `.bat`.
- If PowerShell blocks execution: `powershell -ExecutionPolicy Bypass -File start.ps1`.

> Full step-by-step launch and stop instructions for both Mac and Windows live in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### Manual — Docker (any OS)

```bash
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research/mern
docker compose up
```

Open **http://localhost:3000** in any browser. Done.

No Python, no Node, no MongoDB installed on the host — Docker handles every prerequisite.

---

## What you get

### Seven tabs in the dashboard

| Tab | What it does |
|---|---|
| **📊 Chart Analysis** | Multi-pane HTML5 canvas chart: price + EMA 8/21/50 + pivot S/R + buy/sell arrows + volume + MACD pane + TTM Squeeze. Heikin-Ashi default. Configurable interval (1m → 1d) and period (1d → 1y). Mouse-wheel zoom, fit-all, manual zoom. |
| **🚨 Entry / Exit Alerts** | Pivot levels, 0DTE trade suggestions (Bull Call Break / Bear Put Break) with status badges and reasoning |
| **🎯 Pro Signals** | Stacked EMA, ADX trend strength, MACD, RSI — all daily timeframe |
| **👀 Watchlist** | Multi-symbol live quotes, click-to-switch ticker, persists across sessions |
| **🔍 Screener** | Parallel-scan a list of tickers for entry opportunities. Sorted by signal strength. Click any row to switch the dashboard to that ticker. |
| **📒 Trade Journal** | Log open + closed trades with strike, expiration, P&L. **MongoDB-backed** — survives container restarts. |
| **⛓ Options Chain** | ±2% strikes around ATM, calls on left, puts on right, with mid/bid/ask/IV/OI/volume |

### Universal header

- Ticker picker — any stock or index (SPY, QQQ, IWM, NVDA, TSLA, AAPL preset + custom)
- Master Verdict (BULLISH / BEARISH) with action button (GO LONG / GO SHORT)
- Live SPY price + change %
- Auto-refresh every 10 seconds

---

## Project layout

```
bandaru-trade-research/
├── README.md, LICENSE, VERSION, .env.example       ← top-level docs + config
├── start.command  / start.bat  / start.ps1         ← interactive menu (entry point)
├── stop.command   / stop.bat   / stop.ps1          ← universal stop (all modes)
├── auth-schwab.command / auth-schwab.bat           ← interactive Schwab OAuth
├── push-to-github.command / push-to-github.bat     ← dev workflow
├── cleanup.command / cleanup.bat                   ← run once after migrating layout
│
├── docs/                                           ← USER_GUIDE, BUILD, DEPLOY, etc.
├── mern/                                           ← MERN application (primary)
│   ├── docker-compose.yml
│   ├── server/                                     ← Express API
│   └── client/                                     ← React + Vite
├── legacy-python/                                  ← Flask app + Schwab sidecar
│   ├── app.py, data_api.py, Dockerfile
│   └── src/clients/                                ← Schwab, Yahoo, TastyTrade, demo
└── scripts/                                        ← mode-specific launchers
    ├── mac/        start-docker, start-local, start-schwab, start-docker-schwab (.command)
    └── windows/    same .bat + .ps1
```

15 visible items at the root — only the universal "verbs" (start / stop / auth / push / cleanup) plus the three folders. Mode-specific launchers live one level deeper under `scripts/`.

---

## Architecture

```
┌────────────────────────────────────────┐
│  Browser (http://localhost:3000)       │
└─────────────────┬──────────────────────┘
                  │
┌─────────────────▼──────────────────────┐
│  nginx (client container)              │
│  - serves React static build           │
│  - proxies /api/* → server:4000        │
└─────────────────┬──────────────────────┘
                  │ docker network
┌─────────────────▼──────────────────────┐
│  Express (server, Node 20)             │
│  /api/version  /api/analysis           │
│  /api/candles  /api/chain              │
│  /api/watchlist /api/screener          │
│  /api/trades   (MongoDB-backed)        │
└─────────────────┬──────────────────────┘
                  │
┌─────────────────▼──────────────────────┐
│  MongoDB 7 (data persists in volume)   │
└────────────────────────────────────────┘
```

---

## Tech stack — all open source

| Layer | Tech | License |
|---|---|---|
| Database | MongoDB 7 | SSPL (Postgres swap documented) |
| Backend runtime | Node.js 20 LTS | MIT |
| Backend framework | Express 4 | MIT |
| ODM | Mongoose 8 | MIT |
| Market data | yahoo-finance2 | MIT |
| Frontend | React 18 + Vite 5 | MIT |
| HTTP client | Axios | MIT |
| Web server | Nginx | 2-Clause BSD |
| Container OS | Alpine Linux | MIT-style |
| Orchestration | Docker Compose | Apache 2.0 |

See [mern/NOTICE.md](mern/NOTICE.md) for full attribution + source URLs.

---

## Deployment

This software is designed for any cloud, any OS, any scale. The same Docker images that run locally will deploy unchanged to:

- **AWS** — ECS / Fargate / EKS / Lightsail
- **GCP** — Cloud Run / GKE
- **Azure** — Container Apps / AKS
- **DigitalOcean** — App Platform / Droplets
- **Fly.io**, **Render**, **Railway**, **Heroku**
- **Self-hosted** — any Linux box with Docker installed
- **Kubernetes** — `kompose convert` translates docker-compose

For multi-region deployments, replace the `mongo` service with **MongoDB Atlas** (free 512 MB tier) via the `MONGO_URI` env var.

Minimum footprint: **1 vCPU + 1 GB RAM**. Works on the cheapest tier of every cloud.

---

## Data sources

| Source | Cost | Latency | Setup |
|---|---|---|---|
| **Yahoo Finance** (default) | Free | ~15-min delayed | None — works out of the box |
| **Schwab API** | Free | Real-time | Requires Schwab brokerage + free developer account + OAuth |

Set `DATA_SOURCE=schwab` in `mern/.env` after providing `SCHWAB_API_KEY` + `SCHWAB_APP_SECRET`. Falls back to Yahoo automatically if the Schwab token is invalid.

---

## Folder layout

```
bandaru-trade-research/
├── README.md, LICENSE, VERSION, CHANGELOG.md
├── docs/                          # Product guide, build docs, screenshots
│
├── mern/                          # ← Primary stack (this is the app)
│   ├── docker-compose.yml         # One-command launch
│   ├── README.md, NOTICE.md       # MERN-specific docs + license attribution
│   ├── .env.example
│   ├── server/                    # Express + indicators (ported math)
│   │   ├── Dockerfile, package.json, server.js
│   │   ├── routes/                # 7 endpoint files
│   │   ├── services/              # Indicators, Yahoo, analysis
│   │   └── models/Trade.js        # Mongoose schema
│   └── client/                    # React + Vite
│       ├── Dockerfile, package.json, vite.config.js
│       ├── nginx.conf
│       └── src/
│           ├── App.jsx            # 7 tabs + ticker picker + auto-refresh
│           ├── api.js             # Axios client
│           ├── styles.css
│           ├── chart/BandaruChart.js  # Multi-pane canvas chart
│           └── components/        # Header, ChartAnalysis, ProSignals, Screener,
│                                  # Watchlist, TradeJournal, OptionsChain, etc.
│
└── legacy-python/                 # Original Flask implementation
                                   # Kept for reference; no longer the primary
```

---

## Development (without Docker)

```bash
# Terminal 1 — MongoDB
docker run -d --name bandaru-mongo -p 27017:27017 -v bandaru-mongo:/data/db mongo:7

# Terminal 2 — Express with auto-reload
cd mern/server && npm install && MONGO_URI=mongodb://localhost:27017/bandaru npm run dev

# Terminal 3 — React with hot reload (proxies /api → localhost:4000)
cd mern/client && npm install && npm run dev
# Open http://localhost:5173
```

---

## Versioning

`MAJOR.MINOR.PATCH` per [semver.org](https://semver.org). Edit the `VERSION` file at the project root, add a CHANGELOG entry, tag with `git tag v1.1.0 && git push --tags`. GitHub Actions builds Docker images and publishes a Release with image URIs.

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for version history.

---

## Open-source guarantees

Every component used in this project is open source. The application itself is released under the **MIT License** — see [LICENSE](LICENSE).

You can:
- ✓ Use commercially
- ✓ Modify
- ✓ Distribute
- ✓ Sublicense
- ✓ Run as paid SaaS
- ✓ Deploy to private cloud

Only requirement: preserve the LICENSE copyright notice in source distributions.

Full license attribution for every dependency lives in [mern/NOTICE.md](mern/NOTICE.md).

---

## Educational use only

This is a personal analysis tool. **Not financial advice.** Day trading 0DTE options carries substantial risk of total loss. Premium projections use a simple delta × move approximation and aren't a guarantee of P&L. Verify all signals independently before placing trades.

---

## Legacy Python implementation

The original Flask/Python implementation is preserved at `legacy-python/` for reference. It includes additional features that weren't yet ported to the MERN stack (notably: PyInstaller `.app`/`.exe` builds for end-user desktop distribution, schwab-py OAuth auto-flow, TTM Squeeze pane).

If you specifically need single-binary desktop distributables (no Docker required on the end-user machine), see `legacy-python/README.md`. Otherwise, use the MERN stack.

---

## Contributing

Open issues / pull requests at https://github.com/bandarusrinivas/bandaru-trade-research/issues
