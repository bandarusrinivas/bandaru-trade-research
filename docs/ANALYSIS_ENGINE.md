# Bandaru Analysis Engine — Technical Reference

This document describes **what the dashboard's analysis engine actually
computes**, with file and function citations so every claim can be checked
against the source. It is the mechanic's manual; the user-facing companion is
`USER_GUIDE.md`.

> **Educational reference only — not investment advice.** Every signal here is
> a deterministic computation over public market data; nothing in the engine
> predicts price.

Where this document says "the dashboard uses X," it means the code as
implemented in the repository at the version stamped in `VERSION`. A few
indicators are implemented as simplifications of their textbook definitions
(noted explicitly in §3). Where a section refers to specific functions, the
file path is given.

---

## 1. Philosophy & purpose

The engine is built around classical technical-analysis primitives — pivots,
trend / momentum oscillators, volatility envelopes — combined with explicit
rules. There is no machine learning, no proprietary scoring, and no hidden
weighting; every value on screen reduces to one of the functions described
below.

The intended workflow:

1. Frame the day with pivots and the CPR (`Entry / Exit Alerts`).
2. Confirm trend / momentum (`Pro Signals`, MACD pane on `Chart Analysis`).
3. Confirm participation (Momentum Surge card, §4.4).
4. Plan a 0DTE setup anchored to an unbroken pivot (Suggested 0DTE Trades, §4.3).
5. Verify everything independently before placing a trade.

---

## 2. Architecture & data flow

```
 Browser (React tabs)
        │  GET /api/analysis?ticker=SPY
        ▼
 Express  ─  mern/server/routes/analysis.js
        │   1. fetch quote + previous-day OHLC + 6mo daily bars
        │   2. compute pivots, EMAs, RSI, MACD, ADX
        │   3. compute forward-projected next-day / next-week levels (§4.2)
        │   4. buildRecommendations(price, pivots, chain, ticker)   ← §4.3
        │   5. buildMomentumSurge(quote, prev, daily, rsi, adx)     ← §4.4
        │   6. respond with one JSON document
        ▼
 services/data.js  — adapter dispatcher
   DATA_SOURCE=schwab → Python sidecar (real-time)
   DATA_SOURCE=yahoo  → yahoo-finance2 (~15-min delayed, default)
   Circuit breaker auto-falls-back to Yahoo when Schwab fails repeatedly;
   the UI shows a "DELAYED DATA" banner whenever the engine is on Yahoo.
```

The pure math lives in two files:

- **`mern/server/services/indicators.js`** — the indicators (§3).
- **`mern/server/services/analysis.js`** — the rules that turn indicator
  values into recommendations (§4).

Both are pure JavaScript modules with no I/O, so they can be unit-tested in
isolation (as is done during development).

Other dashboard tabs use the same building blocks:

| Tab | Endpoint | Notable source files |
|---|---|---|
| Chart Analysis | `/api/candles` | `routes/candles.js`, `client/src/chart/BandaruChart.js` |
| Entry / Exit Alerts | `/api/analysis` | `routes/analysis.js`, `services/analysis.js` |
| Pro Signals | `/api/analysis` | same — subset of the JSON |
| GEX Dashboard | `/api/gex-dashboard` | `routes/gexDashboard.js`, `services/blackscholes.js` |
| VEX Dashboard | `/api/vex-dashboard` | `routes/vexDashboard.js`, `services/blackscholes.js` |
| Screener | `/api/screener` | `routes/screener.js` |
| Pre-Market | `/api/premarket` | `routes/premarket.js` |
| Option Decay | `/api/option-decay` | `routes/optionDecay.js`, `services/blackscholes.js` |
| Backtest | `/api/backtest` | `routes/backtest.js`, `services/strategyBacktest.js`, `services/optionBacktest.js` |

---

## 3. Indicator reference

All indicators live in `mern/server/services/indicators.js`. Each entry below
gives the function signature, the parameters the engine uses, and a brief
note on how the engine consumes the output.

### 3.1 Exponential Moving Average

`ema(values, period)` — `EMA_t = α · price_t + (1 − α) · EMA_{t-1}`,
`α = 2 / (period + 1)`. The dashboard uses **EMA 8 / 21 / 50**.

Consumers: the chart draws all three as a trend ribbon, draws buy / sell
arrows on EMA 8 × 21 crosses, and `Pro Signals` shows the latest values.

### 3.2 Relative Strength Index

`rsi(values, 14)` — Wilder-smoothed gains-over-losses ratio. Returns a single
number 0–100 (or 100 when `avgLoss == 0`).

Consumers: Pro Signals; the Momentum Surge detector requires the latest RSI
to be in the **55–75** band (§4.4).

### 3.3 MACD

`macd(values, 12, 26, 9)` — fast minus slow EMA, with a 9-EMA signal line.
Returns `{macd, signal, histogram, trend}` where `trend` is `bullish`,
`bearish`, or `neutral` according to the latest histogram sign.

Consumers: chart's MACD pane, Pro Signals.

### 3.4 ATR — Average True Range

`atr(highs, lows, closes, 14)` — Wilder-smoothed true range. The engine's
unit of "normal movement"; used inside the Keltner half of the TTM Squeeze
(§3.8).

### 3.5 ADX with +DI / −DI

`adx(highs, lows, closes, 14)` — Wilder ADX. Returns
`{adx, plus_di, minus_di, trend, strength}` where:

| ADX | `strength` label |
|---|---|
| ≥ 40 | Very Strong |
| ≥ 25 | Strong |
| ≥ 20 | Developing |
| < 20 | Ranging |

`trend` is `Bullish` when `+DI > −DI`, else `Bearish`.

Consumers: Pro Signals; the Momentum Surge detector requires **ADX > 20**.

### 3.6 Bollinger Bands

`bbands(values, 20, 2)` — `SMA(20) ± 2σ` over the last 20 values. Returns
`{upper, middle, lower}`. Used (indirectly, recomputed inline) inside the TTM
Squeeze.

### 3.7 TTM Squeeze (and the Keltner Channels it embeds)

`ttmSqueeze(highs, lows, closes, period = 20, bbMult = 2, kcMult = 1.5)`.
Internally computes:

- **Bollinger Bands**: `SMA(20) ± 2σ`.
- **Keltner Channels**: `SMA(20) ± 1.5 · ATR(20)`.
  *Note*: standard Keltner Channels use **EMA**(20) as the midline. This
  implementation uses **SMA**(20) for the midline to share computation with
  the Bollinger Bands; results differ slightly from the classical formulation.

Returns `{in_squeeze, momentum, fired}`:

- `in_squeeze` is true when both Bollinger bands sit inside the corresponding
  Keltner channels — a volatility contraction.
- `fired` transitions from `null` to `"bullish"` or `"bearish"` on the single
  bar where the squeeze releases (was on, now off). Direction is set by the
  sign of a **simplified midpoint-distance momentum proxy** —
  `close − ((highHigh + lowLow)/2 + SMA20)/2` — rather than the
  linear-regression slope used in some reference TTM Squeeze implementations.

Consumers: chart's TTM pane; the Momentum Surge detector requires
`fired === "bullish"` on the daily timeframe (§4.4).

### 3.8 Floor-trader pivots

`calculatePivots(high, low, close)` — applied to the prior session's H/L/C:

```
PP = (H + L + C) / 3
R1 = 2·PP − L           S1 = 2·PP − H
R2 = PP + (H − L)       S2 = PP − (H − L)
R3 = H + 2·(PP − L)     S3 = L − 2·(H − PP)
```

These are the engine's primary level set. They drive the Support / Resistance
card, the chart's horizontal level lines, the Suggested 0DTE Trades (§4.3),
and the forward-projected levels (§4.2).

### 3.9 Central Pivot Range (CPR)

`calculateCPR(high, low, close)`:

```
Pivot = (H + L + C) / 3
BC    = (H + L) / 2
TC    = 2·Pivot − BC                (top and bottom are then sorted)
```

The function classifies CPR **width** as a percentage of close:

| width % | `type` | `bias` string |
|---|---|---|
| < 0.10 | narrow | "trending day likely" |
| < 0.25 | moderate | "mixed — no strong CPR bias" |
| ≥ 0.25 | wide | "rangebound day likely" |

The bias is a heuristic label, not a prediction.

### 3.10 Heikin-Ashi (display only)

`computeHeikinAshi` in `client/src/chart/BandaruChart.js` smooths candles for
the chart. **No signal-generation path uses Heikin-Ashi values** — it only
changes how the canvas draws.

---

## 4. Entry / Exit signal logic

The Entry / Exit Alerts tab renders four blocks. Every value is derived
deterministically from §3.

### 4.1 Today's pivot levels — Support / Resistance card

`calculatePivots` (§3.8) applied to the previous session's H/L/C, ordered
top-to-bottom in the UI and colored by role (R / PP / S).

### 4.2 Forward-projected next-day & next-week levels

Implemented in `buildForwardLevels(daily)` in `routes/analysis.js`. Pivots
(§3.8) projected one timeframe forward by reapplying the formula to:

- **Next trading day** — the H/L/C of the most recently completed daily bar.
- **Next week** — the aggregate H/L/C of the most recently completed calendar
  week (Monday–Friday); a week is considered "complete" once its Saturday has
  passed (`Date.now() >= weekMonday + 5·86_400_000`).

Each card exposes five named levels:

- `next_level` = R2 (extended target)
- `target` = R1
- `pivot` = PP
- `strong_support` = S1
- `major_support` = S2

This is a modelled projection of where pivots WOULD sit from yesterday's
session, not a forecast.

### 4.3 Suggested 0DTE Trades

Implemented in `buildRecommendations(currentPrice, pivots, contracts, ticker)`
in `services/analysis.js`. The function emits up to two conditional setups:
one bullish, one bearish.

#### Bull Call Break — emitted when at least one pivot is above current price.

| Field | Computation |
|---|---|
| `entry_trigger` | "Ticker closes a 5-min candle above `nrLevel`" — `nrLevel` is the nearest pivot above current price (R1/R2/R3, or PP when price is below PP). |
| `strike` | Result of `nearestStrike(callStrikes, round(currentPrice))` against the option chain returned by the data adapter. The chain is the nearest expiration available from the data source — see §6. |
| `profit_target_spy` | The **next** pivot up; if there is no next pivot, a symmetric extension `nrLevel + (nrLevel − currentPrice)`. |
| `profit_target_premium` | `mid + 0.55 · (target − currentPrice)` — linear-delta projection (§5.1). |
| `stop_loss_spy` | `nrLevel − 0.3`. |
| `stop_loss_premium` | `mid · 0.5`. |
| `current_premium` | The contract `mid` at the time the response is built. |

#### Bear Put Break — mirror image, emitted when at least one pivot is below
current price; ATM put, support levels in place of resistances.

These are **conditional** setups (you only enter if the trigger condition
prints), not "buy-now" signals.

### 4.4 Momentum Surge ("exploding stocks") card

Implemented in `buildMomentumSurge(quote, prev, daily, rsi, adx)` in
`services/analysis.js`. Six daily-timeframe yes/no criteria; **score** is the
count of met criteria (0–6) and **verdict** is `BULL` when `score ≥ 4`, else
`WAIT`.

| # | Criterion | Computation | Threshold |
|---|---|---|---|
| 1 | Relative volume | `quote.day_volume / mean(daily.volumes[-21:-1])` | ≥ 2.0× |
| 2 | Above prior-day high | `quote.price > prev.high` | strict break |
| 3 | TTM Squeeze fired bullish | `ttmSqueeze(daily.highs, daily.lows, daily.closes).fired` | `"bullish"` |
| 4 | ADX > 20 | `adxData.adx` | strict > 20 |
| 5 | RSI in 55–75 band | `rsi` | inclusive 55–75 |
| 6 | Change > 1.5 % | `quote.change_pct` | strict > 1.5 |

The UI card shows the verdict badge, score, and the six criteria with each
value and threshold side-by-side.

The criterion bundle is patterned after community ThinkorSwim "exploding
stocks" scanners; the thresholds above are the dashboard's defaults and can
be changed in `services/analysis.js`. The detector is a planning checklist,
not a trade trigger.

---

## 5. Modeled option premiums

The dashboard projects premiums in different ways in different places.

### 5.1 Suggested 0DTE Trades — linear-delta projection

`profit_target_premium = current_mid + 0.55 · (target − currentPrice)`. A
flat 55-delta approximation. The model is **deliberately simple**:

- **Theta (time decay) is ignored.** For a 0DTE option, theta is the dominant
  intraday force; the realized premium at the target will usually be
  *smaller* than this projection, especially later in the session.
- **Gamma is ignored.** Delta increases as the option goes ITM; the actual
  premium gain on a real move is typically larger than `0.55 · move`. Gamma
  partially offsets theta.
- **The three premium numbers reference three different prices.**
  `current_premium` is the mid at the current price; `profit_target_premium`
  is the modelled premium when the underlying hits the SPY target;
  `stop_loss_premium` is 50 % of the current mid. They are NOT a clean
  entry / target / stop triad from one fill.
- **The 0.3-point stop and 0.55 delta are hardcoded.** They are scaled for
  SPY (around $400–$700 over the last few years) and do not auto-rescale to a
  $50 stock or a $5,000 index.

For a realistic theta-aware view of a single option, use §5.2.

### 5.2 Option Decay tab — full Black-Scholes with theta

`routes/optionDecay.js` calls `blackScholes(...)` from
`services/blackscholes.js` to produce a price × time-of-day premium grid
from 8:30 AM to 4:00 PM ET, plus delta/gamma/theta/vega. This is the right
tool to estimate "if the underlying reaches X by Y o'clock, what is my option
worth?"

### 5.3 Backtest (Strategy Lab)

`services/strategyBacktest.js` and `services/optionBacktest.js` both use
`blackScholes(...)` to price legs as the synthetic strategy walks through
historical underlying prices.

### 5.4 GEX Dashboard / Gamma route

`routes/gexDashboard.js` and `routes/gamma.js` call `blackScholes(...)` to
compute per-strike dealer gamma when the chain doesn't supply Greeks
directly.

### 5.5 VEX Dashboard

`routes/vexDashboard.js` is the parallel of the GEX route built around
**dealer Vanna Exposure** — the rate of change of dealer delta with
respect to implied volatility (∂Δ/∂σ). Per-strike VEX is computed as

```
vex = vanna × OI × 100 × spot × (calls ? +1 : −1)
```

where `vanna` is the Black-Scholes vanna per share per 1-vol-point
(`-φ(d1) · d2 / σ / 100`, the same for calls and puts), and the
`±1` "naive" sign convention mirrors GEX. The resulting numbers are
dollars of dealer delta-hedge per 1% IV move. The route reuses the same
session-replay logic as GEX so it isn't empty after hours, and the
flip / walls / signal labels follow the same template adapted for IV:

- **Positive VEX** → dealer is net buyer of the underlying when IV
  rises (stabilizing).
- **Negative VEX** → dealer is net seller when IV rises (amplifying).

---

## 6. Limitations — read before trading

These are intentional simplifications. Read them before sizing a trade
against any signal here.

1. `profit_target_premium` in Suggested 0DTE Trades is optimistic (§5.1).
   The Option Decay tab (§5.2) is the realistic view.
2. **"0DTE" labelling is not guaranteed.** The chain used by
   Suggested 0DTE Trades is the **nearest** expiration available from the
   data source. On weekends, holidays, or for tickers without daily expiries,
   the contract may have multiple days to expiry while the UI still says 0DTE.
3. **No liquidity guard.** If the ATM contract has no bid/ask the mid is 0;
   the recommendation then shows `$0` premium and a `$0` stop — a meaningless
   trade. Sanity-check the actual chain on a broker before sizing.
4. **Hardcoded constants are SPY-tuned** (§5.1).
5. **Forward-projected levels are pivot projections, not forecasts** (§4.2).
6. **Momentum Surge thresholds are static.** Market regimes change; a
   2× Rvol that was "exploding" in a quiet week may be only mildly elevated
   during earnings season.
7. **TTM Squeeze implementation deviates from textbook** in two ways
   (§3.7): SMA-based Keltner midline instead of EMA, and a simplified
   midpoint-distance momentum proxy instead of a linear-regression slope.
8. **Data delay matters.** When the engine is on the Yahoo fallback, quotes
   are about 15 minutes delayed and the DELAYED-DATA banner is visible under
   the header. Don't trade off delayed data.

Treat the engine as planning scaffolding — levels to watch and a
confirmation checklist — not a trading system.

---

## 7. References

The engine implements well-known classical technical-analysis primitives.
The standard, widely-attributed sources are:

- **RSI, ADX (+DI / −DI), ATR** — J. Welles Wilder, *New Concepts in Technical
  Trading Systems* (1978).
- **MACD** — Gerald Appel.
- **Bollinger Bands** — John Bollinger.
- **TTM Squeeze** — popularized by John Carter, *Mastering the Trade*. The
  dashboard's implementation differs from Carter's original in two specific
  ways (§3.7).
- **Floor-trader pivots and Central Pivot Range** — long-standing intraday
  trading conventions; multiple sources, no single canonical attribution.
- **Black-Scholes option pricing** — Black & Scholes (1973), with Merton's
  contemporary contribution.
- **"Exploding stocks" criterion bundle** — community ThinkorSwim scanners;
  the dashboard implements the well-known criteria pattern, not any one
  specific script.

Nothing in the engine is proprietary or original to this project; the
value-add is the integration.

---

## 8. Where to look in the code

| Concern | File |
|---|---|
| Indicator math | `mern/server/services/indicators.js` |
| Pivot recommendations + Momentum Surge | `mern/server/services/analysis.js` |
| Forward levels + main analysis response | `mern/server/routes/analysis.js` |
| Option pricing (incl. vanna) | `mern/server/services/blackscholes.js` |
| VEX Dashboard | `mern/server/routes/vexDashboard.js`, `mern/client/src/components/VexDashboard.jsx` |
| Data adapter + circuit breaker | `mern/server/services/data.js` |
| Yahoo / Schwab adapters | `mern/server/services/yahoo.js`, `services/schwab.js` |
| Chart rendering | `mern/client/src/chart/BandaruChart.js` |
| Entry / Exit UI (incl. Momentum Surge card) | `mern/client/src/components/EntryExitAlerts.jsx` |

---

## 9. Disclaimer

This dashboard is an **educational research tool**. It does not constitute
investment, financial, legal, or tax advice. Every projection here is a
deterministic computation under named simplifications (§3 – §6); none of it
predicts future market behavior.

**Trading 0DTE options carries substantial risk of total loss within a single
day.** Verify every signal independently on your broker before placing any
trade. Size positions according to your own risk tolerance, not to anything
this dashboard suggests.
