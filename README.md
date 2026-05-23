# Bandaru Trade Research

**Version 2.1.1** · MERN stack · Open source (MIT) · Docker-portable

Day-trading research dashboard for SPY 0DTE options. Real-time pivots, S/R levels, option-chain analysis, TTM Squeeze, MACD, ADX, Heikin-Ashi candles, stock screener, multi-symbol watchlist, and persistent MongoDB-backed trade journal.

The platform is built on the **MERN stack** (MongoDB + Express + React + Node.js) and shipped as a **Docker Compose** application — runs identically on macOS, Windows, Linux, or any cloud.

---

## Run it

### Easiest — double-click `start`

Just **two commands**, one per job. No menu, no separate steps.

| Platform | Start everything | Stop everything |
|---|---|---|
| **macOS** | `start.command` | `stop.command` |
| **Windows** | `start.bat` | `stop.bat` |

`start` does the whole job in one shot: it checks Docker (and launches Docker Desktop if it's not running), looks at your Schwab sign-in, **builds and starts every container, and opens the dashboard** at **http://localhost:3000**. `stop` tears it all down.

**If a Schwab sign-in is needed**, `start` pauses and lets you choose:

```
  1) Sign in to Schwab now   — real-time data        (recommended)
  2) Skip the sign-in        — free delayed Yahoo data
  3) Quit
```

So one command handles every case: a valid token launches straight into real-time data, an expired token offers a sign-in or a Yahoo fallback, and no Schwab keys at all simply runs on Yahoo.

**Other root scripts (optional — you rarely need them):**
- `auth-schwab.command` / `.bat` — force a fresh Schwab sign-in (`start` runs this for you when needed)
- `cleanup.command` / `.bat` — delete disposable junk (caches, backups, stale build output)
- `push-to-github.command` / `.bat` — staged commit + push
- `install-windows.bat` — one-time prerequisite installer for Windows

**First-run note:** macOS Gatekeeper may block unsigned scripts — right-click → **Open** the first time.

> **New here?** **[docs/INSTALLATION.md](docs/INSTALLATION.md)** has the full
> prerequisites and step-by-step setup for both Mac and Windows — Homebrew,
> Docker Desktop, Git, Python — plus Schwab setup and a troubleshooting
> section. **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** covers how to use every
> tab once it's running.

### Advanced — bare Docker (Yahoo data only)

`docker compose up` is a plain container command — it **cannot** run the interactive Schwab browser sign-in, so this path always runs on free, ~15-minute-delayed Yahoo data:

```bash
cd bandaru-trade-research/mern
docker compose up
```

For real-time Schwab data, use `start.command` / `start.bat` instead — that is the one command that handles the sign-in.

---

## What you get

### Nine tabs in the dashboard

| Tab | What it does |
|---|---|
| **📊 Chart Analysis** | Multi-pane HTML5 canvas chart: price + EMA 8/21/50 + pivot S/R + buy/sell arrows + volume + MACD pane + TTM Squeeze. Heikin-Ashi default. Configurable interval (1m → 1d) and period (1d → 1y). Mouse-wheel zoom, fit-all, manual zoom. |
| **🚨 Entry / Exit Alerts** | Pivot levels, 0DTE trade suggestions (Bull Call Break / Bear Put Break) with status badges and reasoning. |
| **🎯 Pro Signals** | Stacked EMA, ADX trend strength, MACD, RSI — daily timeframe. |
| **👀 Watchlist** | Multi-symbol live quotes, click-to-switch ticker, persists across sessions. |
| **🔍 Screener** | ThinkOrSwim-style multi-column grid scanning a 38-symbol watchlist for actionable setups — pivots, trend, RSI, ADX, RVol, TTM Squeeze, breakout, opportunity score. Runs through a bounded-concurrency pool so the data source isn't rate-limited. Click any row to load that ticker. |
| **📒 Trade Journal** | Log open + closed trades with strike, expiration, P&L. **MongoDB-backed** — survives container restarts. |
| **⛓ Options Chain** | Strikes around ATM, calls on left, puts on right, with mid / bid / ask / IV / OI / volume. |
| **🏢 Profile** | Company overview in a compact dashboard layout: market cap, P/E, beta, 52-week range, a rules-based ~200-word read, a detailed multi-section analysis, short/medium/long-term outlook, a HOLD / TRIM / EXIT / ADD / AVOID position call, key levels, risk factors, earnings, analyst consensus, latest headlines, and a company future outlook. |
| **⏳ Option Decay** | Black-Scholes option-pricing lab: a price × time-of-day premium heatmap (8:30 AM → 4:00 PM) with a mouse-following premium tooltip and adjustable size, decay curves, a pure-theta curve, and live Greeks (delta, gamma, theta, vega). |

### Universal header

- Ticker picker — any stock or index (SPY, QQQ, IWM, NVDA, TSLA, AAPL preset + custom).
- Master Verdict (BULLISH / BEARISH) with action button (GO LONG / GO SHORT).
- Live price + change %.
- Auto-refresh interval selector — 5 s / 10 s / 30 s.

### Data sources, one command

- **Real-time** via the Schwab API (Python sidecar container) — `start` signs you in.
- **Free fallback** via Yahoo Finance (~15-min delayed) — used automatically if Schwab is unavailable, with an in-memory cache + retry/backoff so it isn't rate-limited.
- Index symbols (`SPX`, `XSP`, `VIX`, …) resolve correctly on both sources.

---

## Project layout

```
bandaru-trade-research/
├── README.md, LICENSE, VERSION, .env.example       ← top-level docs + config
├── start.command  / start.bat                      ← launch everything (auth included)
├── stop.command   / stop.bat                       ← stop everything
├── auth-schwab.command / auth-schwab.bat           ← Schwab sign-in (start runs it for you)
├── cleanup.command / cleanup.bat                   ← delete disposable junk
├── push-to-github.command / push-to-github.bat     ← dev workflow
├── install-windows.bat                             ← Windows prerequisite installer
│
├── docs/                                           ← USER_GUIDE, CHANGELOG, etc.
├── mern/                                           ← MERN application (primary)
│   ├── docker-compose.yml
│   ├── server/                                     ← Express API
│   └── client/                                     ← React + Vite
├── legacy-python/                                  ← Schwab data sidecar (Flask)
│   ├── data_api.py, Dockerfile, requirements.txt
│   └── src/clients/schwab_client.py
└── scripts/                                        ← internal helpers (sourced by launchers)
    ├── _shared.sh
    └── check-schwab-token.sh
```

The only two scripts you ever run are **`start`** and **`stop`**. Everything else is either an occasional helper (`auth-schwab`, `cleanup`, `push-to-github`) or an internal building block under `scripts/`.

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
│  /api/version   /api/analysis          │
│  /api/candles   /api/chain             │
│  /api/watchlist /api/screener          │
│  /api/profile   /api/option-decay      │
│  /api/diagnose  (data-source health)   │
│  /api/trades    (MongoDB-backed)       │
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
