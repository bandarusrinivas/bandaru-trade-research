# Changelog

All notable changes to the **Bandaru Trade Research** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Per-day projection pivots (ToS "Projection Pivots" style — pivot levels that step over time)
- WebSocket streaming from Schwab (sub-second updates) — replaces polling for users on Schwab API
- Customizable indicator parameters (RSI period, MACD periods, BB bands)
- Backtesting tab — replay past sessions through the same signal engine

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
