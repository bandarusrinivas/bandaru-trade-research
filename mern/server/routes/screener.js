// Stock screener — parallel scan + ToS-style multi-column output.
//
// Each row reports:
//   ticker, last, mark, net_chg, change_pct,
//   open, high, low,
//   pivots {PP, R1, R2, S1, S2}, pivot_zone ("ABOVE R1" / "BELOW S1" / etc.),
//   trend (BULLISH/BEARISH/NEUTRAL), rsi, adx,
//   volume, volume_x_avg (RVol), ttm_squeeze (ON/OFF/FIRED_BULL/FIRED_BEAR),
//   breakout (BULL_BREAK / BEAR_BREAK / NONE),
//   opportunity + why (the classifier from before) + score
import { Router } from "express";
import * as data from "../services/data.js";
import { adx, rsi, macd, ema, calculatePivots, ttmSqueeze } from "../services/indicators.js";

const router = Router();

// 38-symbol watchlist matching the ToS reference view
const DEFAULT_LIST = [
  "BITB", "COST", "WMT", "MSTR", "UVXY", "GBTC", "META", "GLD",
  "GOOGL", "MDB", "BIDU", "NFLX", "TQQQ", "SPY", "QQQ", "NVDA",
  "AVGO", "AMZN", "AAPL", "CSCO", "VGT", "JPM", "COIN", "ADBE",
  "EEM", "TSLA", "GS", "PLTR", "AMD", "BABA", "PG", "MSFT",
  "XOM", "SNOW", "CRM", "SPX", "XSP", "VIX",
];

const OPP_SCORES = {
  "SQUEEZE FIRED BULL": 90, "SQUEEZE FIRED BEAR": 90,
  "BULLISH BREAKOUT": 85, "BEARISH BREAKDOWN": 85,
  "EMA CROSS BULL": 70, "EMA CROSS BEAR": 70,
  "BULLISH BOUNCE": 65, "BEARISH REJECTION": 65,
  "BULLISH MOMENTUM": 50, "BEARISH MOMENTUM": 50,
  "SQUEEZE COILING": 40,
  "NO SIGNAL": 0,
};

// Classify where price sits relative to pivot levels (matches ToS "Pivots" col)
function pivotZone(price, p) {
  if (!p || !price) return "—";
  if (price > p.R2) return "ABOVE R2";
  if (price > p.R1) return "R1→R2";
  if (price > p.PP) return "PP→R1";
  if (price > p.S1) return "S1→PP";
  if (price > p.S2) return "S2→S1";
  return "BELOW S2";
}

function squeezeLabel(sq) {
  if (sq.fired === "bullish") return "FIRED BULL";
  if (sq.fired === "bearish") return "FIRED BEAR";
  if (sq.in_squeeze) return "ON";
  return "OFF";
}

function round(n, digits = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency pool.
// Firing all 38 symbols at once gets the IP rate-limited by Yahoo (and queues
// up behind the single Schwab sidecar). Scanning a handful at a time keeps the
// data source happy and the whole scan well under the client's timeout.
// ---------------------------------------------------------------------------
const CONCURRENCY = Math.max(1, parseInt(process.env.SCREENER_CONCURRENCY || "5", 10));

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  const lanes = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) lanes.push(lane());
  await Promise.all(lanes);
  return results;
}

async function screenOne(sym) {
  try {
    const daily = await data.getDailyBars(sym, "6mo");
    if (daily.closes.length < 30) return { ticker: sym, error: "insufficient history", score: -1 };

    const N = daily.closes.length;
    const last = daily.closes[N - 1];
    const prev = daily.closes[N - 2];
    const open = daily.opens[N - 1];
    const high = daily.highs[N - 1];
    const low  = daily.lows[N - 1];
    const vol  = daily.volumes[N - 1];

    const netChg = prev != null ? last - prev : null;
    const chgPct = prev ? ((last - prev) / prev) * 100 : 0;

    const pivots = calculatePivots(daily.highs[N - 2], daily.lows[N - 2], prev);
    const zone   = pivotZone(last, pivots);

    const e8  = ema(daily.closes, 8);
    const e21 = ema(daily.closes, 21);
    const r   = rsi(daily.closes, 14);
    const m   = macd(daily.closes);
    const adxData = adx(daily.highs, daily.lows, daily.closes, 14);
    const sq  = ttmSqueeze(daily.highs, daily.lows, daily.closes);

    const avgVol = daily.volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, daily.volumes.length);
    const volX = avgVol ? vol / avgVol : null;

    // Breakout state from yesterday's pivots
    let breakout = "NONE";
    if (pivots.R1 && last > pivots.R1 && (volX || 0) > 1.2) breakout = "BULL BREAK";
    else if (pivots.S1 && last < pivots.S1 && (volX || 0) > 1.2) breakout = "BEAR BREAK";

    // Classification (highest priority wins)
    let opp = "NO SIGNAL", why = "No active setup", direction = "neutral";
    if (sq.fired === "bullish") {
      opp = "SQUEEZE FIRED BULL"; why = `TTM squeeze released, mom ${sq.momentum.toFixed(2)}`; direction = "bull";
    } else if (sq.fired === "bearish") {
      opp = "SQUEEZE FIRED BEAR"; why = `TTM squeeze released, mom ${sq.momentum.toFixed(2)}`; direction = "bear";
    } else if (breakout === "BULL BREAK") {
      opp = "BULLISH BREAKOUT"; why = `Broke above R1 on ${volX.toFixed(1)}× volume`; direction = "bull";
    } else if (breakout === "BEAR BREAK") {
      opp = "BEARISH BREAKDOWN"; why = `Broke below S1 on ${volX.toFixed(1)}× volume`; direction = "bear";
    } else if (e8.length >= 3 && e21.length >= 3) {
      const e8n = e8[e8.length - 1], e8p = e8[e8.length - 2];
      const e21n = e21[e21.length - 1], e21p = e21[e21.length - 2];
      if (e8p && e8n && e21p && e21n) {
        if (e8p <= e21p && e8n > e21n) { opp = "EMA CROSS BULL"; why = "EMA 8 crossed above EMA 21"; direction = "bull"; }
        else if (e8p >= e21p && e8n < e21n) { opp = "EMA CROSS BEAR"; why = "EMA 8 crossed below EMA 21"; direction = "bear"; }
      }
    }
    if (opp === "NO SIGNAL" && adxData.adx >= 25) {
      if (m.histogram > 0 && adxData.trend === "Bullish") {
        opp = "BULLISH MOMENTUM"; why = `ADX ${adxData.adx} · MACD hist +${m.histogram.toFixed(2)}`; direction = "bull";
      } else if (m.histogram < 0 && adxData.trend === "Bearish") {
        opp = "BEARISH MOMENTUM"; why = `ADX ${adxData.adx} · MACD hist ${m.histogram.toFixed(2)}`; direction = "bear";
      }
    }
    if (opp === "NO SIGNAL" && sq.in_squeeze) {
      opp = "SQUEEZE COILING"; why = "Volatility compressed — breakout pending"; direction = "neutral";
    }

    return {
      ticker: sym,
      // price block
      last:     round(last, 2),
      mark:     round((high + low + last) / 3, 2),
      open:     round(open, 2),
      high:     round(high, 2),
      low:      round(low, 2),
      net_chg:  round(netChg, 2),
      change_pct: round(chgPct, 2),
      // pivots + structure
      pivots:   {
        PP: round(pivots.PP, 2),
        R1: round(pivots.R1, 2), R2: round(pivots.R2, 2),
        S1: round(pivots.S1, 2), S2: round(pivots.S2, 2),
      },
      pivot_zone: zone,
      // momentum
      trend:    (adxData.trend || "Neutral").toUpperCase(),
      rsi:      round(r, 1),
      adx:      round(adxData.adx, 1),
      // volume
      volume:   vol,
      volume_x_avg: round(volX, 2),
      // squeeze + breakout
      ttm_squeeze: squeezeLabel(sq),
      breakout,
      // classifier
      opportunity: opp,
      direction,
      score: OPP_SCORES[opp] ?? 0,
      why,
    };
  } catch (e) {
    return { ticker: sym, error: `${e.message}`, score: -1 };
  }
}

router.get("/", async (req, res) => {
  const raw = (req.query.symbols || "").toString().trim();
  const symbols = raw
    ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 50)
    : DEFAULT_LIST;
  const start = Date.now();
  try {
    // Scan a few symbols at a time so the data source isn't rate-limited.
    const results = await runPool(symbols, screenOne, CONCURRENCY);
    // Default order = watchlist order; UI does its own sort
    res.json({
      results,
      count: results.length,
      ok_count: results.filter((r) => !r.error).length,
      error_count: results.filter((r) => r.error).length,
      concurrency: CONCURRENCY,
      elapsed_ms: Date.now() - start,
      cached: false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
