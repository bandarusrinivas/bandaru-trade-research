# Changelog

All notable changes to the **Bandaru Trade Research** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- TTM Squeeze pane in the React canvas chart
- 3D view with day partitions in the React canvas chart
- WebSocket streaming for sub-second updates
- Customizable indicator parameters (RSI period, MACD periods, BB bands)

---

## [2.2.0] — 2026-05-25 — News, GEX dashboard, backtester, delayed-data banner

### Added
- **News tab** — aggregated market news in four sections: breaking headlines,
  a multi-source stock feed, international stock-index levels, and global
  market headlines. Sources: Google News, Yahoo Finance, MarketWatch, Finnhub
  and **Benzinga**. Finnhub headlines need a free `FINNHUB_API_KEY` in `.env`.
- **Breaking-news alert bar** — a global strip (and optional desktop
  notifications) for Fed / President / market-moving headlines.
- **GEX Dashboard tab** — dealer gamma-exposure view (gamma flip level,
  call/put walls). Replays the prior trading session when the market is closed.
- **VEX Dashboard tab** — dealer **Vanna** Exposure view, parallel to GEX.
  Vanna walls, VEX flip level, dealer-bias labels in IV terms ("BUYS ON IV
  RISE" / "SELLS ON IV RISE"). Same prior-session replay behaviour.
- **Pre-Market tab** — unusual-volume scanner with drop-down column filters.
- **Backtest tab (Strategy Lab)** — backtests single- and multi-leg option
  strategies; the input fields adapt to the selected strategy and premiums are
  modeled with Black-Scholes.
- **Delayed-data caution banner** — shows under the header whenever the
  dashboard is serving ~15-min-delayed Yahoo data instead of real-time Schwab.
- **Schwab→Yahoo circuit breaker** — after repeated Schwab failures the server
  skips Schwab for a cooldown and serves Yahoo immediately, so pages keep
  loading fast instead of stalling on a dead token.
- **Entry / Exit Alerts** now projects next-day and next-week support /
  resistance levels.
- **Momentum Surge card** in Entry / Exit Alerts — six-criterion
  "exploding stocks" detector (Rvol, prior-day-high break, TTM Squeeze fire,
  ADX, RSI band, change %) with BULL / WAIT verdict.
- **`docs/ANALYSIS_ENGINE.md`** — full technical reference for the engine,
  every indicator, the entry/exit signal logic and modeled premiums.
- **Screener** gained a drop-down universe picker (top US large-caps + major
  indexes) and click-to-filter column headers; **Pre-Market** gained the same
  column filters.

### Changed
- Global UI density pass — tighter, more compact layouts so more content fits
  without scrolling.
- `start.command` now waits for the UI container as well as the API before
  opening the browser, so the dashboard never opens to an empty page.
- `DataSourceBanner` polls `/api/version` on a slow 60s cadence — the data
  source rarely changes.

### Fixed
- **International stock indexes** in the News tab were blank — they now load
  from Yahoo's v8 chart endpoint, which needs no crumb/cookie handshake.
- **`BandaruChart`** wheel-zoom listener is now detached on teardown
  (`destroy()`), preventing a listener leak if the chart is rebuilt.

### Performance
- **`OISnapshot`** collection now has a TTL index — snapshots auto-expire after
  120 days instead of growing in MongoDB forever.
- The Yahoo and Schwab adapters sweep expired cache entries every 5 minutes so
  their in-memory caches can't grow unbounded over a long-running session.

### Removed
- Dead server exports `getMovers()` (schwab.js) and `_cacheStats()` (yahoo.js).
- The experimental no-Docker single-process Windows build
  (`start-windows-nodocker.bat`, `docs/WINDOWS-NODOCKER.md`) — the Docker build
  is the supported path.
- Repo cleanup — stale Vite temp files, a leftover `.env.placeholder.bak`,
  `.DS_Store` files, and old Schwab token backups.

---

## [2.1.1] — 2026-05-21 — Screener fix + launcher consolidation

### Removed
- **Launcher sprawl deleted.** `restart-schwab`, `rebuild-all`, `start.ps1` /
  `stop.ps1`, the whole `scripts/mac/` and `scripts/windows/` folders, the dead
  `legacy-python/scripts/` folder, and `docs/WINDOWS_INSTALL.md` are gone.
  Everything they did is now covered by `start.command` / `start.bat`. The root
  keeps just `start`, `stop`, `auth-schwab`, `cleanup`, `push-to-github`, and
  `install-windows.bat`.

### Fixed
- **Screener no longer fails on scan.** It previously fired all 38 watchlist
  symbols at the data source simultaneously, which got the connection
  rate-limited (Yahoo `Too Many Requests`) or queued behind the single Schwab
  sidecar — the whole scan then timed out or returned all-error rows. Scans now
  run through a bounded-concurrency pool (5 at a time, `SCREENER_CONCURRENCY`).
- **Index symbols in the watchlist** (`SPX`, `XSP`, `VIX`) now resolve. Yahoo
  serves indices under caret tickers, so the plain names 404'd; added an alias
  map (`SPX→^GSPC`, `XSP→^XSP`, `VIX→^VIX`, plus `NDX`/`RUT`/`DJI`).
- Screener client timeout raised to 90s so a cold first scan isn't cut off.
- **Schwab launchers no longer die silently when the token ages out.** Every
  launcher runs `set -e`; the token validator captured `output=$(python3 …)`
  whose process exits non-zero for a 5+-day-old token — under `set -e` that
  aborted the *whole script* during preflight, before the re-OAuth prompt ever
  appeared. `start.command`, `auth-schwab.command`, and `check-schwab-token.sh`
  now capture those exit codes safely, so an expired token leads to the
  re-OAuth prompt instead of a silent exit.
- **Launchers now report Schwab data honestly.** The old end-to-end probe just
  checked for `"bars"` in a response and declared "real-time data flowing" —
  but the server silently falls back to Yahoo when the token is dead, so that
  was a false success. Launchers now hit `/api/diagnose`, which probes the
  Schwab adapter directly, and print the precise reason (expired token, app not
  approved, missing scope, sidecar down) when it's actually on Yahoo.

### Changed
- Screener API response now reports `ok_count` / `error_count` / `concurrency`;
  the status bar shows `loaded / total` and a clearer timeout message.
- **`auth-schwab.command` now cycles the Schwab sidecar** — it stops the
  `bandaru-schwab` container before OAuth and restarts it after, so a freshly
  minted token is always loaded by the container instead of the stale one
  lingering in memory. It also reports success only after schwab-py confirms a
  live quote, so a bad token fails loudly instead of pretending to work.
- **Launching collapsed to two commands: `start.command` and `stop.command`.**
  `start.command` is a single do-everything launcher — it checks Docker (and
  starts Docker Desktop if needed), builds and starts every container, verifies
  real-time data is flowing, and opens the dashboard. `start.bat` / `stop.bat`
  mirror it on Windows.
- **`start` now offers a data-source choice** when the Schwab token is missing
  or expired: (1) sign in to Schwab now for real-time data, (2) skip and run on
  free delayed Yahoo data, or (3) quit. A valid token launches straight into
  real-time data with no prompt; with no Schwab keys at all it goes straight to
  Yahoo. Plain `docker compose up` remains a Yahoo-only path — it can't run the
  interactive Schwab sign-in, so use `start` for real-time data.
- **Profile tab reorganized** into a denser dashboard layout — Key Stats folded
  into the header as a one-line stat strip, Position Recommendation paired
  beside Quick Read, and Headlines paired beside About. Fewer stacked cards,
  everything fits on one screen.

---

## [2.1.0] — 2026-05-19 — Schwab-in-Docker + analytics

### Added
- **Schwab data in Docker** — new Python sidecar container (`legacy-python/data_api.py`)
  exposes `/data/*` endpoints; the Express server proxies to it when
  `DATA_SOURCE=schwab`. `docker-compose.schwab.yml` override + `--profile schwab`.
- **Stock Profile tab** — short/medium/long-term outlooks, HOLD/TRIM/EXIT/ADD
  position recommendation, key levels (support/resistance/stop/target), risk
  factors, company future outlook, earnings, analyst consensus + recent
  rating changes, 200-word + detailed multi-section summaries.
- **Option Decay Lab tab** — Black-Scholes premium modeling: premium-vs-price
  curves across time snapshots, theta-decay-at-spot graph, full Greeks
  (Δ Γ Θ ν), intrinsic/extrinsic split, price × time premium grid.
- **ToS-style Screener** — 38-symbol watchlist, dense multi-column grid
  (Last, Mark, Net Chg, OHLC, Pivots, Trend, RSI, ADX, Volume, RVol, TTM Sq,
  Breakout), click-to-sort, sticky symbol column.
- **Refresh interval picker** — 5s / 10s / 30s, persisted, header control.
- **`/api/diagnose`** — probes each data adapter, returns plain-English
  recommendation on why data isn't loading.
- **Token validation** — launchers check the Schwab token age (7-day refresh
  window) and auto-prompt OAuth when expired.
- **`restart-schwab.command` / `.bat`** — one-click clean Schwab restart.
- **Windows install guide + `install-windows.bat`** auto-prereq checker.

### Changed
- **Project layout** — mode-specific launchers moved to `scripts/mac/` +
  `scripts/windows/`; root keeps `start` / `stop` / `auth-schwab` /
  `push-to-github` / `cleanup` / `restart-schwab`.
- **`start.command`** — interactive menu; auto-detects Schwab credentials and
  defaults to the Docker + Schwab option.
- Launchers close stale browser tabs before opening a new one.

### Fixed
- Yahoo adapter — removed `suppressNotices` call (gone in yahoo-finance2 2.14),
  pinned to 2.13.x, added TTL cache + retry to stop rate-limit flooding.
- schwab-py 1.4 — `get_price_history_every_minute` no longer takes a
  `frequency` kwarg; dispatches to per-interval named methods.
- Multi-day intraday — sidecar now honors the period parameter.
- Port cleanup no longer kills Docker's own port-forwarder.
- `.env` auto-mounted into the Schwab sidecar so credentials load regardless
  of how `docker compose` is invoked.

---

## [2.0.0] — 2026-05-14 — MERN rewrite

**Major refactor.** Rebuilt on the MERN stack (MongoDB + Express + React + Node.js) and now shipped as Docker Compose. The original Python implementation is preserved at `legacy-python/`.

### Added
- **Docker Compose stack** — one-command launch (`docker compose up`) brings up Mongo + Express + React+nginx on any OS
- **MERN server (Express + Node 20)** — port of every indicator (SMA, EMA, RSI, MACD, ATR, ADX-Wilder, Bollinger, TTM Squeeze, pivots), screener engine, recommendation engine
- **MERN client (React 18 + Vite)** — 7-tab dashboard (Chart Analysis, Entry/Exit Alerts, Pro Signals, Watchlist, Screener, Trade Journal, Options Chain)
- **Multi-pane canvas chart** (`BandaruChart.js`) — price + EMA 8/21/50 + pivots + buy/sell arrows + Volume + MACD; Heikin-Ashi default; mouse-wheel zoom
- **MongoDB-backed Trade Journal** — replaces localStorage, survives container restarts, multi-device sync ready
- **GitHub Container Registry** publishing on `v*` tags — `ghcr.io/bandarusrinivas/bandaru-trade-research-server` + `-client`
- **NOTICE.md** with full open-source attribution for every dependency

### Changed
- **Primary stack: Python/Flask → MERN.** Root `README.md` rewritten around the new stack.
- **`.github/workflows/build.yml`** — Docker image build matrix with `docker compose up` smoke test (was PyInstaller `.app`/`.exe`)
- **Project layout** — `mern/` (primary), `legacy-python/` (reference), `docs/` (cross-cutting)
- **Trade Journal** — `localStorage` → MongoDB

### Deprecated
- Single-binary `.app` / `.exe` distribution. Still available via `legacy-python/` for that specific use case.

### Removed (not yet ported to MERN)
- TTM Squeeze chart pane (math ported, UI TODO)
- 3D view with day partitions
- Smooth Heikin-Ashi (Regular HA available)
- Configurable refresh-interval dropdown (fixed at 10s)
- Buy/sell arrows from EMA-cross are present, but option-chain overlay lines + ONH/ONL chart overlays are TODO

---

## [1.0.0] — 2026-05-14

First production release. Stable, tested, distributable as standalone `.app` (Mac) and `.exe` (Windows).

### Added

#### Chart
- **Native HTML5 canvas chart** (no TradingView dependency) — pivots, EMAs (8/21/50), MACD, TTM Squeeze, volume
- **3D view by default** — yesterday + today + tomorrow's reserved session space, with bold blue partition lines spanning all panes
- **Day section headers** — real dates (Wed May 13 / Thu May 14 / Fri May 15) plus YESTERDAY/TODAY/TOMORROW tags
- **NOW marker** — bright blue vertical line at the most recent bar so live session progress is unmistakable
- **Heikin-Ashi by default** with bright green / coral pink palette matching the reference style
- **Smooth Heikin-Ashi** option (double-smoothed EMA → HA → EMA, ultra-clean trend continuation)
- **Chunky block-style candles** — 85% body width, minimum 2.5px body height, crisp inset stroke
- **Buy/Sell arrows** on EMA 8/21 crossovers (green ▲ below bars, pink ▼ above bars)
- **Day-change separators** — vertical dashed lines mark each calendar boundary
- **Option-chain levels overlay** — Max Pain (gold), top Call OI (magenta), top Put OI (orange), top Call/Put Volume (lighter dashes)
- **Pivot levels** — R3/R2/R1/PP/S1/S2/S3 with right-side label chips; coral red R / bright green S / white PP
- **ONH/ONL premarket range** — cyan dashed lines with chips
- **VC: Volume Confirmation badge** — fires when latest-bar volume > 1.5× the 20-bar average
- **Crosshair hover** with body-anchored tooltip showing O/H/L/C/Volume + change + range
- **Zoom in/out** — buttons (− / + / ⤢ reset), mouse-wheel anchored on cursor position
- **Period buttons**: 1D · 2D · 3D · 5D · 1M · 3M · 6M · 1Y · YTD
- **Interval buttons**: 1m · 5m · 15m · 30m · 1h · 1d
- **Chart legend** (collapsible) explaining every color and shape

#### Tabs
- **Chart Analysis** — full-bleed chart with all controls
- **Entry / Exit Alerts** — day-trading snapshot, S/R pivots, 0DTE trade suggestions with GO/READY/STANDBY/INVALID status badges
- **Pro Signals** — Stacked EMA, ADX (daily + intraday 5m, with delta chips), TTM Squeeze, ONH/ONL, VC, Chandelier Exit
- **Watchlist** — multi-symbol live quotes, add/remove/reset, click-to-switch ticker
- **Trade Journal** — log trades manually with CSV export
- **Options Chain** — split-row layout (Calls left, Strike center, Puts right) with all Greeks

#### Header
- **Universal ticker picker** — any stock or index (SPY, QQQ, IWM, NVDA, TSLA, AAPL preset buttons + custom input)
- **Master Verdict synthesis** — BULLISH / BEARISH / MIXED based on EMA stack + RSI + MACD + ADX
- **Auto-refresh** — configurable 2 / 5 / 10 / 30s, persists across sessions
- **🔔 Alerts** — desktop notifications + chime when GO triggers fire
- **Pop Out Current Tab** — open the current tab in a new browser window

#### Data sources
- **Schwab API** (real-time, full Greeks) — OAuth via auto-flow that reads redirect URL from Safari (no copy/paste)
- **Yahoo Finance** (~15-min delayed, approximated Greeks) — no auth needed
- **Demo client** (synthetic data) — for UI testing without market hours
- **Automatic fallback** — if Schwab returns `token_invalid` or any auth error, the client transparently switches to Yahoo and the dashboard keeps working

#### Indicators (in `indicators.py` and `pro_indicators.py`)
- RSI(14), MACD(12,26,9), Bollinger(20,2), Keltner Channels
- ADX(14) — Wilder smoothing — with +DI/-DI, trend label, strength tier (Very Strong / Strong / Developing / Ranging), reported to 2 decimals
- TTM Squeeze — Bollinger inside Keltner detection + 4-color momentum histogram (cyan/blue/yellow/red)
- Volume Confirmation — last bar volume vs. 20-bar average
- Chandelier Exit — Highest High - 3×ATR(22)
- Stacked EMA — TOS-style D8/D21/D50 hierarchy
- Heikin-Ashi + Smooth Heikin-Ashi transforms

#### Recommendation engine (in `analysis.py`)
- 4 pivot-anchored playbooks: Bull Call Break, Bear Put Break, Bull Call Bounce, Bear Put Rejection
- ATM strike selection with delta × move premium projection
- GO threshold 0.05%, READY threshold 0.20%, INVALID threshold 0.30%
- Per-recommendation entry trigger, profit target, stop loss (premium + SPY price), reasoning

#### Distribution
- **PyInstaller-based standalone builds** — `.app` for macOS, `.exe` folder for Windows
- **GitHub Actions CI** — auto-build on every push, auto-release on `v*` tags
- **`bandaru` CLI** — unified start / stop / exit / status / auth / open commands
- **One-click launchers** — `start-app.command`, `stop-app.command`, `exit-app.command`, `auth-schwab.command`, `push-to-github.command`, `build-mac.command`
- **Windows equivalents** — `build-windows.bat`, `push-to-github.bat`

#### Documentation
- README.md — landing page with feature list, architecture diagram
- USER_GUIDE.md — start/stop usage
- BUILD.md — packaging + distribution guide
- PUSH_TO_GITHUB.md — Mac + Windows push instructions
- GITHUB_SETUP.md — initial repo setup
- PRODUCT_GUIDE.md — comprehensive feature reference with visuals
- LICENSE — MIT
- CHANGELOG.md — this file

### Security
- `.gitignore` excludes `.env`, `schwab_token.json`, `.venv/`
- User data (tokens, config) stored in OS-standard per-user dir, not in the app bundle
- Push script refuses to commit if secrets would leak

### Tests
- 120-check pytest suite covering pivots, indicators, recommendations, Greeks

---

## [0.x] — Pre-release iterations

The 0.x series tracked the rapid prototyping period:

- **0.9** — Cross-platform packaging (PyInstaller) shipped
- **0.8** — Configurable refresh interval + chart zoom
- **0.7** — ADX intraday + delta chips + 2-decimal precision
- **0.6** — Smooth HA, option-chain overlays, 3D view with day partitions
- **0.5** — Native canvas chart replacing TradingView; Heikin-Ashi + MACD pane
- **0.4** — Pro Signals tab; TTM Squeeze, Stacked EMA, Master Verdict
- **0.3** — Multi-tab layout; Trade Journal; full Greeks via Black-Scholes
- **0.2** — Watchlist; universal ticker picker; Yahoo fallback
- **0.1** — Initial Flask scaffolding, Schwab client, pivot calculations

---

[Unreleased]: https://github.com/bandarusrinivas/bandaru-trade-research/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bandarusrinivas/bandaru-trade-research/releases/tag/v1.0.0
