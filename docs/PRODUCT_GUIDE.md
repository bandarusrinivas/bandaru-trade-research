# Bandaru Trade Research — Product Guide

**Version 2.0.0** · MERN + Docker · [Changelog](CHANGELOG.md) · [User Guide](USER_GUIDE.md) · [Build](BUILD.md) · [Deploy](DEPLOY.md)

Comprehensive feature reference. Walks through every screen, every indicator, and the underlying logic.

---

## Table of contents

1. [Architecture](#architecture)
2. [Dashboard header](#dashboard-header)
3. [Chart Analysis tab](#chart-analysis-tab)
4. [Entry / Exit Alerts tab](#entry--exit-alerts-tab)
5. [Pro Signals tab](#pro-signals-tab)
6. [Watchlist tab](#watchlist-tab)
7. [Screener tab](#screener-tab)
8. [Trade Journal tab](#trade-journal-tab)
9. [Options Chain tab](#options-chain-tab)
10. [Recommendation engine logic](#recommendation-engine-logic)
11. [Screener opportunity classifier](#screener-opportunity-classifier)
12. [Glossary](#glossary)

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│   Browser (any modern: Safari/Chrome/Firefox/Edge)   │
│   - React 18 SPA, served by nginx                    │
│   - Auto-refreshes every 10s                         │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP /api/*
                       ▼
┌──────────────────────────────────────────────────────┐
│   nginx (port 80) → proxies /api → server:4000       │
└──────────────────────┬───────────────────────────────┘
                       │ docker network
                       ▼
┌──────────────────────────────────────────────────────┐
│   Express API (Node 20)                              │
│   Routes:                                            │
│     GET  /api/version   — semver + product info     │
│     GET  /api/analysis  — quote+pivots+recs+indic.  │
│     GET  /api/candles   — OHLCV bars                 │
│     GET  /api/chain     — options chain              │
│     GET  /api/watchlist — multi-symbol quotes        │
│     GET  /api/screener  — opportunity scan           │
│     CRUD /api/trades    — Trade Journal              │
└──────────────────────┬───────────────────────────────┘
                       │ Mongoose
                       ▼
┌──────────────────────────────────────────────────────┐
│   MongoDB 7 (persistent volume: mongo-data)          │
│   Collection: trades  (Trade Journal)                │
└──────────────────────────────────────────────────────┘

Market data → yahoo-finance2 npm package (server-side fetch on each request)
```

All services run in Docker containers. The browser sees only `localhost:3000` and never talks to Mongo directly.

---

## Dashboard header

The top of every screen has four control regions:

| Region | What it does |
|---|---|
| **Brand** | "Bandaru — Trade Research" gradient logo. Clicks do nothing (intentional). |
| **Ticker picker** | Free-text input + Go button + presets (SPY / QQQ / IWM / NVDA / TSLA / AAPL). Switching the ticker repoints the entire dashboard. Persists to `localStorage`. |
| **Live quote** | Current price + change + change %. Auto-updates every 10 seconds. Green/pink indicates direction. |
| **Master Verdict** | One-line synthesis: "BULLISH · GO LONG" or "BEARISH · GO SHORT" based on the most-actionable recommendation. Color-coded banner. |

Below the header: tab navigation (7 tabs). Below the tabs: the active tab's content.

Footer shows the running app version (read from `/api/version`) and an "MIT · educational use only" note.

---

## Chart Analysis tab

The flagship view. Multi-pane HTML5 canvas chart rendered by `mern/client/src/chart/BandaruChart.js`.

### Panes (top → bottom)

| Pane | Height | What's drawn |
|---|---|---|
| **Price** | 55% | Candles, EMA 8/21/50, pivot S/R lines with chips, buy/sell arrows |
| **Volume** | 12% | Bullish/bearish-tinted volume bars per candle |
| **MACD (12, 26, 9)** | 18% | Blue MACD line, orange signal line, green/pink histogram |
| **(TTM Squeeze)** | — | Math ported, UI pane TODO in MERN. Available in legacy Python. |

### Visual encoding

- **Green candles** — close ≥ open (bullish bar)
- **Pink candles** — close < open (bearish bar)
- **Heikin-Ashi by default** — smoothed candles that produce continuous color runs during trends. Toggle to Regular OHLC via the candle-style buttons.
- **EMA lines** — cyan (8), blue (21), coral (50). Stacked-bullish when 8 > 21 > 50 with price above.
- **Pivot lines** (dotted): coral red R3/R2/R1 (resistance), white PP (pivot point), green S1/S2/S3 (support). Each has a right-axis chip showing the exact price.
- **Buy ▲ arrow** below a bar: EMA 8 just crossed above EMA 21 — bullish trigger
- **Pink ▼ arrow** above a bar: EMA 8 just crossed below EMA 21 — bearish trigger

### Controls

- **Interval**: 1m · 5m · 15m · 30m · 1h · 1d
- **Period**: 1d · 2d · 3d · 5d · 1mo · 3mo · 6mo · 1y
- **Candle style**: Regular · Heikin-Ashi
- **Zoom**: − (out) · + (in) · ⤢ (fit all). Mouse wheel also zooms.

The chart polls `/api/candles?ticker=...&interval=...&period=...` every 10 seconds.

---

## Entry / Exit Alerts tab

Two-panel grid:

### Left panel — Support / Resistance pivots

Vertical list of all 7 pivot levels (R3 → S3) with the current price overlaid. Each row shows the level name, its exact dollar value, and is color-coded (coral resistance, white PP, green support).

### Right panel — Suggested 0DTE Trades

One card per recommendation. The engine currently produces two setups:

1. **Bull Call Break** — buy ATM call if price closes above the nearest resistance
2. **Bear Put Break** — buy ATM put if price closes below the nearest support

Each card shows:

| Field | Meaning |
|---|---|
| **Type badge** (CALL/PUT) | Green for calls, pink for puts |
| **Strategy title** | "Long CALL — Break above R1 (745.66)" |
| **Strike + Mid** | The selected option's strike price and current mid premium |
| **Entry trigger** | "SPY closes a 5-min candle above $745.66" |
| **Target** | Profit target as SPY price + projected option premium |
| **Stop** | Stop loss as SPY price + premium ($0.30 past trigger / 50% premium) |
| **Reasoning** | One-line "why" |

See [Recommendation engine logic](#recommendation-engine-logic) below for the full algorithm.

---

## Pro Signals tab

Four professional-grade indicator panels, all derived from daily-bar history:

| Panel | What it shows |
|---|---|
| **Stacked EMA (D8 · D21 · D50)** | Bullish stack if price > EMA 8 > EMA 21 > EMA 50. Bearish if reversed. Mixed otherwise. Single-number trend gauge. |
| **ADX — Trend Strength** | ADX(14) Wilder + DI/-DI + trend label + strength tier. Color-coded status: ADX > 25 = Strong (warn color), > 20 = Developing, < 20 = Ranging. |
| **MACD (12, 26, 9)** | Latest MACD, Signal, Histogram values + trend label (bullish/bearish/neutral). |
| **RSI (14)** | Latest RSI + Overbought/Neutral/Oversold label. > 70 overbought (mean-revert risk), < 30 oversold (bounce opportunity). |

All math is ported from the legacy Python `indicators.py` — identical formulas. Source: `mern/server/services/indicators.js`.

---

## Watchlist tab

Multi-symbol live quote grid.

- **Default list**: SPY, QQQ, IWM, DIA, ^VIX, VXX, NVDA, AAPL, MSFT, GOOGL, META, TSLA, AMZN, AMD
- **Add symbol**: type in the input box (e.g., `NFLX`, `^DJI`, `BTC-USD`), click "+ Add"
- **Remove symbol**: click ✕ on the tile
- **Reset**: restores the default list
- **Click any tile** to switch the entire dashboard to that ticker

Each tile shows:
- Symbol (cyan, monospace)
- Current price ($ formatted)
- Change + change % (green up arrow / pink down arrow)
- Color-coded left border (green/pink)

Choices persist in browser `localStorage`. Quote data refreshes every 15 seconds.

---

## Screener tab

The most ambitious tab. Scans a list of tickers in parallel and ranks them by entry-opportunity strength.

### How it works

1. User edits the ticker list (or uses the default 16-stock list)
2. Click "🔍 Scan" — sends `GET /api/screener?symbols=...` to the server
3. Server fetches daily bars for each ticker in parallel (~3 seconds for 16 tickers)
4. For each ticker, it runs the full indicator pipeline: pivots, EMA 8/21, RSI, MACD, ADX, TTM Squeeze
5. Classifies each ticker into one of 11 opportunity types with a score 0-90
6. Returns results sorted by score (highest first)

### Filter dropdown

- **All** — show every ticker
- **Bullish only** — direction = bull
- **Bearish only** — direction = bear
- **Actionable ≥65** — high-conviction setups (breakouts, EMA crosses, bounces)
- **Strong only ≥85** — strongest tier (Squeeze fires, big breakouts)

### Table columns

| Column | Meaning |
|---|---|
| **Score** | 0–90, color-coded chip (green strong, blue actionable, gold watch) |
| **Ticker** | Click any row to switch the dashboard to that ticker |
| **Price** | Latest close |
| **Δ%** | Day's change |
| **Opportunity** | Pill showing one of 11 classifications (see below) |
| **Why** | One-line explanation: "Broke above R1 on 2.3× volume" |
| **RSI** | Latest RSI(14) |
| **ADX** | Latest ADX(14) |
| **Trend** | Bullish / Bearish from +DI vs −DI |
| **Vol ×** | Today's volume relative to 20-bar average |

See [Screener opportunity classifier](#screener-opportunity-classifier) below for the full ranking logic.

---

## Trade Journal tab

Manual trade log with persistent MongoDB storage.

### Form (top)

- **Type**: CALL / PUT
- **Strike**: numeric
- **Entry price**: per-contract premium
- **Qty**: number of contracts (default 1)
- **Expiration**: date picker
- **Platform**: free-text (e.g., "Robinhood", "Schwab")
- **Notes**: free-text
- Submit → POST to `/api/trades`, creates a Mongoose document, appears immediately in the Open table

### Open Trades table

Live list of `status: "open"` trades. Each row has a **Close** button — prompts for exit premium, then PATCHes the trade to `status: "closed"`. Each row also has a ✕ delete button.

### Closed Trades table

`status: "closed"` trades with calculated P&L: `(exit_price - entry_price) × qty × 100`. Green if positive, pink if negative.

### Persistence

All trades live in MongoDB collection `trades` (Mongoose schema in `mern/server/models/Trade.js`). They survive container restarts as long as you don't run `docker compose down -v` (the `-v` flag wipes the volume).

Multi-device sync ready: any browser hitting the same backend sees the same trades.

---

## Options Chain tab

Live 0DTE chain table (±2% strikes around the current price).

| Region | Content |
|---|---|
| **Left** | Calls — Vol · OI · IV · Mid · Bid×Ask |
| **Center** | Strike price (highlighted blue when ATM) |
| **Right** | Puts — Bid×Ask · Mid · IV · OI · Vol |

The ATM row is tinted blue. Rows are sorted by strike ascending.

Data comes from `yahoo-finance2`'s `options()` method — first expiration date returned by Yahoo (typically today's 0DTE for SPY).

---

## Recommendation engine logic

Code: `mern/server/services/analysis.js` — `buildRecommendations()`.

### Setup selection

Two setups are always considered:

1. **Bull Call Break** — only if `resistances.length && calls.length`
2. **Bear Put Break** — only if `supports.length && puts.length`

### Strike selection

For each setup, the engine picks the **ATM strike** — the option whose strike is nearest to `Math.round(currentPrice)`.

Why ATM? On 0DTE:
- Highest gamma (premium moves fastest per $1 move in underlying)
- Tightest bid/ask (most liquid)
- Balanced risk/reward (delta ~0.5)

### Targets + stops

- **Profit target** = next pivot in the same direction (R1 break → R2 is target, S1 break → S2)
- **Projected premium** = `current_premium + delta × (target_SPY - current_SPY)` (linear approximation; rough but practical for intraday)
- **Stop loss premium** = 50% of entry (wide-but-conventional 0DTE stop)
- **Stop loss SPY** = $0.30 past trigger in the wrong direction

### What's not yet implemented in MERN

The legacy Python engine also produces:
- **Bull Call Bounce** — buy call if price is at support (within 0.3%) with RSI < 40
- **Bear Put Rejection** — buy put if price is at resistance (within 0.3%) with RSI > 60
- **GO/READY/STANDBY/INVALID status badges** based on distance from trigger
- **Master Verdict scoring** combining EMA stack + RSI + MACD + ADX

These are TODO for the MERN port. The Python version at `legacy-python/` has the full logic if you need it today.

---

## Screener opportunity classifier

Code: `mern/server/routes/screener.js` — `screenOne()`.

### 11 opportunity types (ranked by score)

| Score | Opportunity | When it fires |
|---|---|---|
| 90 | **SQUEEZE FIRED BULL** | TTM Squeeze just released with positive momentum |
| 90 | **SQUEEZE FIRED BEAR** | TTM Squeeze just released with negative momentum |
| 85 | **BULLISH BREAKOUT** | Price closed above R1 with > 1.5× average volume |
| 85 | **BEARISH BREAKDOWN** | Price closed below S1 with > 1.5× average volume |
| 70 | **EMA CROSS BULL** | EMA 8 crossed above EMA 21 (today's bar) |
| 70 | **EMA CROSS BEAR** | EMA 8 crossed below EMA 21 (today's bar) |
| 65 | **BULLISH BOUNCE** | At support with RSI < 40 (oversold) |
| 65 | **BEARISH REJECTION** | At resistance with RSI > 60 (overbought) |
| 50 | **BULLISH MOMENTUM** | ADX > 25 + bullish trend + positive MACD histogram |
| 50 | **BEARISH MOMENTUM** | ADX > 25 + bearish trend + negative MACD histogram |
| 40 | **SQUEEZE COILING** | TTM Squeeze active (BB inside KC) — breakout pending |
| 0 | **NO SIGNAL** | None of the above |

Priority order: the classifier returns the **first** match in this list, so a Squeeze Fire always beats an EMA Cross even if both are present.

---

## Glossary

| Term | Definition |
|---|---|
| **0DTE** | Zero Days To Expiration — options expiring today |
| **ATM / ITM / OTM** | At-the-money / In-the-money / Out-of-the-money |
| **ADX** | Average Directional Index — measures trend STRENGTH (not direction). > 25 strong |
| **Bollinger Bands** | SMA ± 2σ. 95% of price action sits inside the bands |
| **Δ Delta** | Premium change per $1 move in the underlying |
| **EMA** | Exponential Moving Average — weights recent bars more than older bars |
| **Heikin-Ashi** | Smoothed candles using OHLC averages. Continuous color runs = strong trends |
| **Keltner Channels** | EMA ± 1.5 × ATR. Used inside TTM Squeeze |
| **MACD** | Moving Average Convergence Divergence — fast EMA minus slow EMA |
| **Mongoose** | ODM library mapping JS classes to MongoDB documents |
| **Pivot Points** | Floor-trader formula: PP = (H+L+C)/3, R1 = 2×PP − L, S1 = 2×PP − H |
| **RSI** | Relative Strength Index — > 70 overbought, < 30 oversold |
| **SSPL** | Server Side Public License — MongoDB's license. Open source for end-user apps |
| **TTM Squeeze** | John Carter's volatility indicator. Bollinger inside Keltner = coiling |
| **+DI / −DI** | Directional movement indicators. +DI > −DI = bullish direction |

---

*Last updated: v2.0.0 · See [CHANGELOG.md](CHANGELOG.md) for version history.*
