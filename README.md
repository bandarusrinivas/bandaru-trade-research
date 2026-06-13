# Bandaru Trade Research

**Version 2.2.0** · MERN stack · Open source (MIT) · Docker-portable

Day-trading research dashboard for SPY 0DTE options. Real-time pivots, S/R levels, option-chain analysis, dealer gamma-exposure (GEX), MACD, ADX, Heikin-Ashi candles, a stock screener, a pre-market scanner, an aggregated market-news feed, an option-strategy backtester, a multi-symbol watchlist, and a persistent MongoDB-backed trade journal.

The platform is built on the **MERN stack** (MongoDB + Express + React + Node.js) and shipped as a **Docker Compose** application — runs identically on macOS, Windows, Linux, or any cloud.

---

## Run it

### Easiest — double-click the launcher

| Platform     | First-time install     | Start (daily)    | Stop             | Schwab re-auth        |
| ------------ | ---------------------- | ---------------- | ---------------- | --------------------- |
| **macOS**    | `start.command`        | `start.command`  | `stop.command`   | `auth-schwab.command` |
| **Windows**  | **`install.bat`**      | `start.bat`      | `stop.bat`       | `auth-schwab.bat`     |

The Mac path uses `start.command` for both first-run and daily use — it
detects what needs doing. The Windows path uses a dedicated
**`install.bat`** for the one-time setup (8 automated prerequisite
checks, `.env` creation, credential prompt, container build, browser
launch), then `start.bat` for daily use (no rebuild — ~10 seconds).

Both flows: check Docker, look at your Schwab sign-in, build and start
every container, open the dashboard at **<http://localhost:3000>**.
`stop` tears it all down (your trade-journal data is preserved across
restarts).

**If a Schwab sign-in is needed**, the launcher pauses and lets you choose:

```
  1) Sign in to Schwab now   — real-time data        (recommended)
  2) Skip the sign-in        — free delayed Yahoo data
  3) Quit
```

So one launcher handles every case: a valid token launches straight into
real-time data, an expired token offers a sign-in or a Yahoo fallback,
and no Schwab keys at all simply runs on Yahoo.

**Other root scripts (optional — you rarely need them):**
- `auth-schwab.command` / `.bat` — force a fresh Schwab sign-in (the launcher runs this for you when needed)
- `cleanup.command` — delete disposable junk (caches, backups, stale build output) — Mac only
- `push-to-github.command` — staged commit + push — Mac only

**First-run notes:**
- **macOS** Gatekeeper may block unsigned scripts — right-click → **Open** the first time.
- **Windows** SmartScreen may warn *"Windows protected your PC"* — click **More info → Run anyway**.

> **New here?**
> - **Windows users:** **[WINDOWS-INSTALL.md](WINDOWS-INSTALL.md)** is a
>   complete, beginner-friendly Windows-only walkthrough. Step-by-step
>   from "what is Docker?" through troubleshooting tables and OneDrive /
>   antivirus gotchas. Read this first.
> - **Mac users (or both):** **[docs/INSTALLATION.md](docs/INSTALLATION.md)**
>   has the full prerequisites and setup for both platforms — Homebrew,
>   Docker Desktop, Git — plus Schwab setup and a troubleshooting
>   section. (Python is **not** required on Windows.)
> - **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** covers how to use every
>   tab once it's running.
> - **[docs/ANALYSIS_ENGINE.md](docs/ANALYSIS_ENGINE.md)** is the
>   mechanic's manual — every indicator, formula and signal-generation
>   rule that drives the dashboard.

### Advanced — bare Docker (Yahoo data only)

`docker compose up` is a plain container command — it **cannot** run the interactive Schwab browser sign-in, so this path always runs on free, ~15-minute-delayed Yahoo data:

```bash
cd bandaru-trade-research/mern
docker compose up
```

For real-time Schwab data, use `start.command` / `start.bat` instead — that is the one command that handles the sign-in.

---

## What you get

### Fourteen tabs in the dashboard

| Tab | What it does |
|---|---|
| **📊 Chart Analysis** | Multi-pane HTML5 canvas chart: price + EMA 8/21/50 + pivot S/R + CPR band + buy/sell arrows + volume + MACD pane. Regular or Heikin-Ashi candles. Configurable interval (1m → 1d) and period (1d → 1y). Mouse-wheel zoom, fit-all, manual zoom. |
| **🚨 Entry / Exit Alerts** | Pivot levels, 0DTE trade suggestions (Bull Call Break / Bear Put Break) with status badges and reasoning, plus projected next-day and next-week support/resistance levels. |
| **🎯 Pro Signals** | Stacked EMA, ADX trend strength, MACD, RSI — daily timeframe. |
| **🧲 GEX Dashboard** | Dealer gamma-exposure dashboard — gamma flip level, call/put walls and intraday positioning. Replays the prior trading session when the market is closed. |
| **🌀 VEX Dashboard** | Dealer **vanna**-exposure dashboard — parallel to GEX but built around IV sensitivity (∂Δ/∂σ): vanna walls, VEX flip level, "BUYS / SELLS ON IV RISE" dealer-bias labels. Same prior-session replay. |
| **👀 Watchlist** | Multi-symbol live quotes, click-to-switch ticker, persists across sessions. |
| **🔍 Screener** | ThinkOrSwim-style multi-column grid. A drop-down universe picker (top US large-caps + major indexes) feeds setups — pivots, trend, RSI, ADX, RVol, breakout, opportunity score — with click-to-filter column headers. Runs through a bounded-concurrency pool so the data source isn't rate-limited. |
| **🌅 Pre-Market** | Unusual-volume scanner for pre-market movers, with drop-down column filters. |
| **📰 News** | Aggregated market news — breaking headlines, a multi-source stock feed (Finnhub, Benzinga, Google News, Yahoo Finance, MarketWatch), international stock-index levels, and global market headlines. |
| **📈 Profile** | Company overview in a compact dashboard layout: market cap, P/E, beta, 52-week range, a rules-based ~200-word read, a detailed multi-section analysis, short/medium/long-term outlook, a HOLD / TRIM / EXIT / ADD / AVOID position call, key levels, risk factors, earnings, analyst consensus, latest headlines, and a company future outlook. |
| **⛓ Options Chain** | Strikes around ATM, calls on left, puts on right, with mid / bid / ask / IV / OI / volume. |
| **📉 Option Decay** | Black-Scholes option-pricing lab: a price × time-of-day premium heatmap (8:30 AM → 4:00 PM) with a mouse-following premium tooltip and adjustable size, decay curves, a pure-theta curve, and live Greeks (delta, gamma, theta, vega). |
| **🧪 Backtest** | Strategy Lab — backtest single- and multi-leg option strategies (the input fields adapt per strategy) with Black-Scholes modeled premiums. |
| **📒 Trade Journal** | Log open + closed trades with strike, expiration, P&L. **MongoDB-backed** — survives container restarts. |

### Universal header

- Ticker picker — any stock or index (SPY, QQQ, IWM, NVDA, TSLA, AAPL preset + custom).
- Master Verdict (BULLISH / BEARISH) with action button (GO LONG / GO SHORT).
- Live price + change %.
- Auto-refresh interval selector — 5 s / 10 s / 30 s.

### Data sources, one command

- **Real-time** via the Schwab API (Python sidecar container) — `start` signs you in.
- **Free fallback** via Yahoo Finance (~15-min delayed) — used automatically if Schwab is unavailable or its token is dead, with an in-memory cache + retry/backoff so it isn't rate-limited. A circuit breaker skips Schwab after repeated failures so the dashboard keeps loading fast on Yahoo data instead of stalling.
- When the dashboard is running on delayed Yahoo data it shows a **caution banner** under the header, so you always know which data you're looking at.
- The News tab aggregates headlines from Google News, Yahoo Finance, MarketWatch, Finnhub and Benzinga.
- Index symbols (`SPX`, `XSP`, `VIX`, …) resolve correctly on both sources.

---

## Project layout

```
bandaru-trade-research/
├── README.md, LICENSE, VERSION, .env.example       ← top-level docs + config
├── WINDOWS-INSTALL.md                              ← beginner-friendly Windows guide
├── start.command  / start.bat                      ← launch everything (auth included)
├── stop.command   / stop.bat                       ← stop everything
├── auth-schwab.command / auth-schwab.bat           ← Schwab sign-in (start runs it for you)
├── install.bat                                     ← Windows first-time installer (prereq check + .env + build)
├── cleanup.command                                 ← delete disposable junk (Mac)
├── package-release.command                         ← package a shareable Docker artifact
├── push-to-github.command                          ← dev workflow (Mac)
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
    ├── check-schwab-token.sh
    └── windows/                                    ← PowerShell scripts backing the .bat files
        ├── install.ps1                             ← prereq check + .env + build
        ├── start.ps1                               ← daily launcher
        ├── stop.ps1                                ← `docker compose down`
        └── auth-schwab.ps1                         ← Schwab OAuth (in-container)
```

The scripts you ever double-click are **`start`** and **`stop`** (Mac) or
**`install` / `start` / `stop`** (Windows). Everything else is either an
occasional helper (`auth-schwab`) or an internal building block under
`scripts/`.

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
│   │   ├── routes/                # 18 endpoint files
│   │   ├── services/              # Indicators, Yahoo, Schwab, analysis
│   │   └── models/                # Trade + OI-snapshot Mongoose schemas
│   └── client/                    # React + Vite
│       ├── Dockerfile, package.json, vite.config.js
│       ├── nginx.conf
│       └── src/
│           ├── App.jsx            # 13 tabs + ticker picker + auto-refresh
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
