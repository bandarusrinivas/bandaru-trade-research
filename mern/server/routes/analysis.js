// /api/analysis?ticker=SPY
//
// The dashboard's home endpoint. App.jsx polls this every refreshMs and feeds
// the result to half a dozen tabs. If this throws an unhandled exception the
// page goes blank — so it's built to be defensive: each upstream call settles
// independently, each indicator is wrapped in a guard, and partial results
// are returned with a per-field `errors` map rather than a single 500.

import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots, adx, rsi, macd, ema } from "../services/indicators.js";
import { buildRecommendations, getTodayExpiration, buildMomentumSurge } from "../services/analysis.js";

const router = Router();

// Monday (UTC) of the calendar week that contains a timestamp.
function weekMonday(ts) {
  const d = new Date(ts);
  const day = d.getUTCDay();               // 0 Sun .. 6 Sat
  const shift = day === 0 ? -6 : 1 - day;  // back to Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shift);
}

// Forward-projected support / resistance using floor-trader pivots:
//   next_day  — pivots from the most recent completed daily bar
//   next_week — pivots from the most recent completed calendar week
// Modelled projection, not a forecast.
function buildForwardLevels(daily) {
  const n = daily?.timestamps?.length || 0;
  if (n < 6) return null;
  if (!daily.highs || !daily.lows || !daily.closes) return null;

  const shape = (p) => ({
    next_level: p.R2,
    target: p.R1,
    pivot: p.PP,
    strong_support: p.S1,
    major_support: p.S2,
    resistance_3: p.R3,
    support_3: p.S3,
  });

  const li = n - 1;
  const lh = daily.highs[li], ll = daily.lows[li], lc = daily.closes[li];
  if (lh == null || ll == null || lc == null) return null;
  const nextDay = {
    source_date: new Date(daily.timestamps[li]).toISOString().slice(0, 10),
    ...shape(calculatePivots(lh, ll, lc)),
  };

  const weeks = new Map();
  for (let i = 0; i < n; i++) {
    if (daily.highs[i] == null || daily.lows[i] == null || daily.closes[i] == null) continue;
    const key = weekMonday(daily.timestamps[i]);
    if (!weeks.has(key)) {
      weeks.set(key, { monday: key, high: -Infinity, low: Infinity, close: null, lastTs: 0 });
    }
    const w = weeks.get(key);
    w.high = Math.max(w.high, daily.highs[i]);
    w.low = Math.min(w.low, daily.lows[i]);
    if (daily.timestamps[i] >= w.lastTs) { w.lastTs = daily.timestamps[i]; w.close = daily.closes[i]; }
  }
  const weekList = [...weeks.values()].sort((a, b) => a.monday - b.monday);
  if (!weekList.length) return { next_day: nextDay, next_week: null };
  let wk = null;
  for (let i = weekList.length - 1; i >= 0; i--) {
    if (Date.now() >= weekList[i].monday + 5 * 86400000) { wk = weekList[i]; break; }
  }
  if (!wk) wk = weekList[weekList.length - 1];
  if (wk.high === -Infinity || wk.low === Infinity || wk.close == null) {
    return { next_day: nextDay, next_week: null };
  }
  const nextWeek = {
    source_week: new Date(wk.monday).toISOString().slice(0, 10)
      + " … " + new Date(wk.monday + 4 * 86400000).toISOString().slice(0, 10),
    ...shape(calculatePivots(wk.high, wk.low, wk.close)),
  };

  return { next_day: nextDay, next_week: nextWeek };
}

// Run a synchronous computation safely. Returns the result, or null on throw,
// and records the message in `errors[label]` so the caller knows what was
// degraded without the whole response failing.
function safe(label, errors, fn) {
  try {
    const v = fn();
    return v;
  } catch (e) {
    errors[label] = e?.message || String(e);
    return null;
  }
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const errors = {};

  // ── 1. Pull every upstream concurrently; one failure does NOT abort the rest.
  const [quoteR, prevR, dailyR, chainR] = await Promise.allSettled([
    data.getQuote(ticker),
    data.getPreviousDay(ticker),
    data.getDailyBars(ticker, "6mo"),
    data.getOptionChain(ticker),
  ]);
  const quote = quoteR.status === "fulfilled" ? quoteR.value : null;
  const prev  = prevR.status  === "fulfilled" ? prevR.value  : null;
  const daily = dailyR.status === "fulfilled" ? dailyR.value : null;
  const chain = chainR.status === "fulfilled"
    ? chainR.value
    : { underlying_price: quote?.price ?? null, contracts: [] };
  if (quoteR.status === "rejected") errors.quote        = quoteR.reason?.message || String(quoteR.reason);
  if (prevR.status  === "rejected") errors.previous_day = prevR.reason?.message  || String(prevR.reason);
  if (dailyR.status === "rejected") errors.daily        = dailyR.reason?.message || String(dailyR.reason);
  if (chainR.status === "rejected") errors.chain        = chainR.reason?.message || String(chainR.reason);

  // Need at minimum a price to surface anything useful.
  if (!quote?.price) {
    return res.status(503).json({
      ticker,
      error: `No current price for ${ticker}`,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 2. Build derived values defensively.
  const pivots = (prev && prev.high != null && prev.low != null && prev.close != null)
    ? safe("pivots", errors, () => calculatePivots(prev.high, prev.low, prev.close))
    : null;

  const recs = safe("recommendations", errors,
    () => buildRecommendations(quote.price, pivots || {}, chain?.contracts || [], ticker)) || [];

  const adxData = daily?.closes ? safe("adx", errors, () => adx(daily.highs, daily.lows, daily.closes, 14)) : null;
  const rsiVal  = daily?.closes ? safe("rsi", errors, () => rsi(daily.closes, 14))                          : null;
  const macdData = daily?.closes ? safe("macd", errors, () => macd(daily.closes))                           : null;
  const ema8  = daily?.closes ? safe("ema8",  errors, () => ema(daily.closes, 8))  : null;
  const ema21 = daily?.closes ? safe("ema21", errors, () => ema(daily.closes, 21)) : null;
  const ema50 = daily?.closes ? safe("ema50", errors, () => ema(daily.closes, 50)) : null;

  const forward_levels = daily ? safe("forward_levels", errors, () => buildForwardLevels(daily)) : null;
  const momentum_surge = (quote && prev && daily)
    ? safe("momentum_surge", errors, () => buildMomentumSurge(quote, prev, daily, rsiVal, adxData))
    : null;

  const lastOr = (arr) => Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;

  // ── 3. Always respond — even if half of the above failed.
  res.json({
    timestamp:     new Date().toISOString(),
    ticker,
    data_source:   process.env.DATA_SOURCE || "yahoo",
    active_source: process.env.DATA_SOURCE || "yahoo",
    spy:           quote || {},
    previous_day:  prev,
    pivots,
    forward_levels,
    expiration:    getTodayExpiration(),
    recommendations: recs,
    momentum_surge,
    chain_count:   chain?.contracts?.length || 0,
    chain_error:   errors.chain || null,
    indicators: {
      rsi:  rsiVal,
      macd: macdData,
      adx:  adxData,
      emas: {
        ema8:  lastOr(ema8),
        ema21: lastOr(ema21),
        ema50: lastOr(ema50),
      },
    },
    errors: Object.keys(errors).length ? errors : undefined,
  });
});

export default router;
