# Bandaru Trade Research — User Guide

How to use the dashboard once it is installed. For installation and
prerequisites, see [INSTALLATION.md](INSTALLATION.md).

> **Educational tool — not financial advice.** Every signal, score, and
> projection is a research aid. 0DTE options can lose 100% of their value.
> Verify everything independently before trading.

---

## Contents

1. [Starting & stopping](#1-starting--stopping)
2. [The dashboard header](#2-the-dashboard-header)
3. [Tabs](#3-tabs)
   - [Chart Analysis](#31-chart-analysis) · [Entry / Exit Alerts](#32-entry--exit-alerts) · [Pro Signals](#33-pro-signals) · [Watchlist](#34-watchlist) · [Screener](#35-screener) · [Pre-Market](#36-pre-market) · [Profile](#37-profile) · [Options Chain](#38-options-chain) · [Option Decay](#39-option-decay) · [Backtest](#310-backtest) · [Trade Journal](#311-trade-journal)
4. [Data sources](#4-data-sources)
5. [Honest limitations](#5-honest-limitations)
6. [Glossary](#6-glossary)

---

## 1. Starting & stopping

| | Start | Stop |
|---|---|---|
| **macOS** | double-click `start.command` | double-click `stop.command` |
| **Windows** | double-click `start.bat` | double-click `stop.bat` |

`start` checks Docker, builds/starts the containers, and opens the dashboard at
**<http://localhost:3000>**. The first run takes several minutes; later runs
take seconds. Your trade journal is preserved between runs.

If `start` needs a Schwab sign-in, follow the prompts — full detail is in
[INSTALLATION.md § 6](INSTALLATION.md#6-schwab-real-time-data-optional).

---

## 2. The dashboard header

The header is always visible, above the tabs:

- **Ticker picker** — type any stock or index symbol (SPY, QQQ, IWM, NVDA,
  TSLA, AAPL, …) and press Return. Index symbols like `SPX`, `XSP`, `VIX`
  resolve correctly. The chosen ticker drives every tab and is remembered
  between sessions.
- **Master Verdict** — a `BULLISH` / `BEARISH` badge with an action button
  (`GO LONG` / `GO SHORT`), summarising the current technical picture.
- **Live price & change %** — updates on the auto-refresh interval.
- **Refresh interval** — `5s` / `10s` / `30s`. Slower intervals are gentler on
  the data feed.

---

## 3. Tabs

### 3.1 Chart Analysis

A multi-pane price chart with stacked indicator panels:

- **Price pane** — candlesticks, EMA 8 / 21 / 50, pivot support/resistance
  lines, and green/red arrows where EMA 8 crosses EMA 21.
- **Volume**, **MACD (12, 26, 9)**, and **TTM Squeeze** panes below.

**Controls:**

- **Interval** — `1m` to `1d`. **Period** — `1d` to `1y`.
- **Candle style** — `Regular` (default) or `Heikin-Ashi` (smoothed, trend-friendly).
- **CPR on/off** — toggles the Central Pivot Range overlay (see below).
- **Zoom** — `−` / `+` buttons, the fit button, or the mouse wheel.

**CPR (Central Pivot Range).** When CPR is on, a shaded band shows three levels
from the prior session: **TC** (top central), **Pivot**, and **BC** (bottom
central). A readout under the chart labels the band **narrow**, **moderate**,
or **wide**: a *narrow* CPR often precedes a trending day, a *wide* CPR a
rangebound day. Treat it as a rough bias, not a guarantee.

**Pivot Stop Ladder & Support Validation** (panel below the chart):

- **Current zone** — which pivot band price is sitting in right now.
- **Long stop / Short stop** — a suggested stop, anchored to the pivot just
  past your position with an ATR-based buffer, plus the risk %.
- **Trailing-stop ladder** — shows how the stop ratchets up as price clears
  each pivot.
- **Level reliability** — over the last ~60 sessions, how often each pivot was
  *tested* and *held* (a hold-rate bar), and how far price typically pierced
  the level before reversing — a guide for sizing your stop buffer. These are
  historical tendencies, not promises.

### 3.2 Entry / Exit Alerts

Today's pivot levels plus rules-based 0DTE trade suggestions — "Bull Call
Break" / "Bear Put Break" — each with an entry trigger, profit target, stop,
and the reasoning behind it.

### 3.3 Pro Signals

A daily-timeframe read of trend quality: stacked EMA alignment, ADX trend
strength, MACD, and RSI.

### 3.4 Watchlist

Live quotes for several symbols at once. Click any tile to load that symbol
into every tab. The list persists between sessions.

### 3.5 Screener

A ThinkOrSwim-style multi-column grid that scans a 38-symbol watchlist for
actionable setups.

- **Window toggle** — scan on the `15m` or `daily` timeframe.
- **Columns** — last/mark, pivots and pivot zone, trend, RSI, ADX,
  **MTF** (multi-timeframe agreement between the 15-minute and daily trend,
  shown as ▲▼ glyphs), **IV%** (ATM implied volatility), **IV/HV** (are
  options rich or cheap vs realized volatility), **γ Wall** (heaviest call-OI
  strike — a gamma-squeeze proxy), TTM Squeeze, relative volume, breakout, and
  an **opportunity score**.
- **Filters** — narrow to MTF-aligned names, gamma-flagged names, and more.
- Click any row to load that ticker.

> MTF, IV%, IV/HV and γ Wall are modelled estimates, not exchange IV Rank or
> true dealer-gamma. The screener notes this inline.

### 3.6 Pre-Market

An **unusual-volume scanner** for finding option-trade candidates before or
during the session. It scans ~40 liquid, heavily-optioned large-caps and ranks
them by a blend of **gap %** and **relative volume**.

- Each row shows price, gap %, RVOL (with its basis), volume vs average, day
  range, a **bias** (calls / puts / neutral), the ATM strike, and a score.
- Rows flagged **⚡ unusual** had a notable gap or volume surge.
- **Unusual only** filter and **Re-scan** button. Click a ticker to load it.

> Pre-market volume baselines are limited by the data feed — the gap is the
> most reliable pre-open signal and is weighted accordingly.

### 3.7 Profile

A compact company dashboard for the current ticker: market cap, P/E, beta,
52-week range, a rules-based ~200-word read, a detailed multi-section analysis,
short/medium/long-term outlook, a HOLD / TRIM / EXIT / ADD / AVOID position
call, key levels, risk factors, earnings history, analyst consensus, and
latest headlines.

**Gamma Exposure (GEX)** panel:

- **Total net GEX** and the **volatility regime** — *positive gamma* means
  dealers dampen moves (pinning, mean-reversion); *negative gamma* means
  dealers amplify moves (trendier, larger swings).
- **Zero-gamma (flip)** estimate, **call wall**, and **put wall**.
- A **net-GEX-by-strike** bar chart.

> GEX uses the standard naive convention (calls positive, puts negative) on the
> near-term expiration chain. It is a modelling estimate of the volatility
> regime — not measured dealer positioning.

### 3.8 Options Chain

Strikes around at-the-money, calls on the left and puts on the right, with mid
/ bid / ask / IV / open interest / volume.

**Open Interest Flow** panel:

- The day-over-day change in **call and put open interest**, with the strikes
  that gained the most OI listed first.
- A green highlight marks **bullish accumulation** — call OI rising while
  price rose.

> There is no historical option-price feed, so OI history is built by
> snapshotting the chain once per day. On the first day you see a "baseline
> captured" message; the day-over-day comparison appears the next session.

### 3.9 Option Decay

A Black-Scholes "Simulated Returns" lab for a single option contract:

- Pick the **contract** (type, strike, DTE) — the header shows it.
- A big **profit/loss** number for the modelled trade, switchable between $ and %.
- A **decay chart** from *Now* to *expiration*.
- An **underlying-price slider** — drag it to see the premium and P&L at any
  price.
- Live **Greeks** (delta, gamma, theta, vega).
- **Probability of Profit** and **Finishes In-The-Money** estimates.
- A **Heatmap** toggle for the classic price × time premium grid.

### 3.10 Backtest

Replays a trading strategy over historical data to check whether the process
holds up. Two modes, switchable at the top right:

**📈 Equity mode** — long-only share trades.

- Pick a **signal** (EMA cross, RSI reversal, MACD, TTM squeeze, pivot
  breakout) and a **period** (1y / 2y / 5y).
- Results: total return vs buy-and-hold, CAGR, win rate, profit factor, max
  drawdown, an equity curve, and a full trade list.

**🎲 Options mode** — modelled call/put trades, to validate specific strikes.

- **Signal** — the entry trigger (bullish → buys a call, bearish → buys a put).
- **Side** — Calls + Puts, Calls only, or Puts only.
- **DTE** — 0DTE, 1, 3, 7, 14, or 30 days to expiration.
- **Strike** — a moneyness selector from −2 ITM to +5 OTM, so you can validate
  exactly which strikes work.
- **Exit rule** — premium **Target / Stop** (with presets like +50% / −50%),
  opposite **Signal**, or hold to **Expiration**.
- **Lookback** — 1, 2, or 3 months.
- Results: option strategy return vs underlying buy-and-hold, win rate, profit
  factor, max drawdown, **calls vs puts broken out separately**, an equity
  curve, and a trade log showing each trade's side, strike, DTE, modelled IV,
  entry/exit premium, days held, return %, and P&L.

> **The option backtest is modelled.** No feed provides historical option
> prices, so every premium is reconstructed with Black-Scholes from the
> underlying's real historical price and its trailing realized volatility. It
> captures leverage, theta decay, and convexity correctly, but it is an
> estimate of how the process would have performed — not tick-for-tick real
> fills. Spreads, slippage, and commissions are not modelled.

### 3.11 Trade Journal

Log your real trades — type, strike, expiration, entry/exit price, P&L, notes.
Entries are stored in MongoDB and **survive container restarts**.

---

## 4. Data sources

| Source | Cost | Latency | When it is used |
|---|---|---|---|
| **Yahoo Finance** | Free | ~15 min delayed | Default; also the automatic fallback |
| **Schwab API** | Free | Real-time | When `DATA_SOURCE=schwab` and a valid token exists |

If Schwab is selected but its token is invalid or expired, the app
automatically falls back to Yahoo so the dashboard never goes dark. Check the
active source any time at
<http://localhost:4000/api/diagnose?ticker=SPY>. To set up Schwab, see
[INSTALLATION.md § 6](INSTALLATION.md#6-schwab-real-time-data-optional).

---

## 5. Honest limitations

The platform is built to *not* overstate what it knows. Keep these in mind:

- **Delayed data on Yahoo.** Quotes are ~15 minutes behind unless Schwab
  real-time is connected.
- **GEX, MTF, IV%, IV/HV, γ Wall** are modelled estimates, not exchange-grade
  IV Rank or measured dealer-gamma positioning.
- **OI Flow has no history on day one** — it accrues going forward and cannot
  be backfilled.
- **The option backtest is modelled** with Black-Scholes (see § 3.10) — it does
  not replay real historical option fills, and excludes spreads, slippage, and
  commissions.
- **Pivot/CPR level reliability** reflects past tendencies, not future
  guarantees.
- Premium projections use simplified pricing math and are not a promise of P&L.

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **0DTE** | An option expiring the same day it is traded. |
| **Pivots** | Floor-trader support/resistance levels (PP, R1–R3, S1–S3) from the prior session's high/low/close. |
| **CPR** | Central Pivot Range — the Pivot plus the TC/BC band; its width hints at trending vs rangebound days. |
| **EMA** | Exponential Moving Average — a trend line that weights recent prices more heavily. |
| **MACD** | Momentum indicator built from the gap between two EMAs. |
| **RSI** | Relative Strength Index (0–100) — gauges overbought (>70) / oversold (<30). |
| **ADX** | Average Directional Index — measures *trend strength* (not direction). |
| **TTM Squeeze** | Flags when volatility compresses (a squeeze) and "fires" on release. |
| **ATR** | Average True Range — typical price movement per bar; used to size stops. |
| **IV / HV** | Implied vs Historical (realized) Volatility — IV/HV > 1 means options look rich. |
| **GEX** | Gamma Exposure — an estimate of how option dealer hedging dampens or amplifies moves. |
| **Open Interest** | The number of option contracts currently held open at a strike. |
| **RVOL** | Relative Volume — today's volume compared to a normal day. |
| **Greeks** | Delta, gamma, theta, vega — an option's sensitivities to price, time, and volatility. |
| **MTF** | Multi-Timeframe — whether the short and long timeframes agree on direction. |

---

*For installation, prerequisites, and troubleshooting see
[INSTALLATION.md](INSTALLATION.md). Educational use only — not financial advice.*
