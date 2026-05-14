# Bandaru Trade Analysis Platform

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

## Quick start

### Run locally (development)

```bash
git clone https://github.com/bandarusrinivas/bandaru-trade-analysis.git
cd bandaru-trade-analysis
./setup.command          # one-time: creates .venv, installs deps
./start-app.command      # launches Flask + opens browser
```

Open `http://127.0.0.1:5000` if it doesn't open automatically.

### Build a standalone app (for distribution)

```bash
# macOS:
./build-mac.command       # → dist/Bandaru Trade Analysis.app

# Windows:
build-windows.bat         # → dist\Bandaru Trade Analysis\*.exe
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

## Schwab OAuth setup

1. Create a free **Individual Developer** account at [developer.schwab.com](https://developer.schwab.com)
2. Submit an app — set the Callback URL to `https://127.0.0.1`. Wait 1–3 business days for approval.
3. Once approved, copy the **App Key** + **App Secret** into `.env`:
   ```
   SCHWAB_API_KEY=...
   SCHWAB_APP_SECRET=...
   ```
4. Run `bandaru auth` — opens Safari to Schwab login, reads the redirect URL automatically (zero copy/paste), exchanges it for a token, saves to `schwab_token.json`.

The refresh token auto-renews for 7 days. After that, re-run `bandaru auth`.

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
