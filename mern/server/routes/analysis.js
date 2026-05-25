import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots, adx, rsi, macd, ema } from "../services/indicators.js";
import { buildRecommendations, getTodayExpiration } from "../services/analysis.js";

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

  const shape = (p) => ({
    next_level: p.R2,        // extended target / next resistance
    target: p.R1,            // "likely end up at"
    pivot: p.PP,
    strong_support: p.S1,    // primary support
    major_support: p.S2,     // deeper support
    resistance_3: p.R3,
    support_3: p.S3,
  });

  // ── Next trading day — from the last daily bar ──
  const li = n - 1;
  const nextDay = {
    source_date: new Date(daily.timestamps[li]).toISOString().slice(0, 10),
    ...shape(calculatePivots(daily.highs[li], daily.lows[li], daily.closes[li])),
  };

  // ── Next week — aggregate calendar weeks, use the last completed one ──
  const weeks = new Map();
  for (let i = 0; i < n; i++) {
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
  let wk = null;
  for (let i = weekList.length - 1; i >= 0; i--) {
    // A week is complete once its Saturday (Monday + 5 days) has passed.
    if (Date.now() >= weekList[i].monday + 5 * 86400000) { wk = weekList[i]; break; }
  }
  if (!wk) wk = weekList[weekList.length - 1];
  const nextWeek = {
    source_week: new Date(wk.monday).toISOString().slice(0, 10)
      + " … " + new Date(wk.monday + 4 * 86400000).toISOString().slice(0, 10),
    ...shape(calculatePivots(wk.high, wk.low, wk.close)),
  };

  return { next_day: nextDay, next_week: nextWeek };
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const [quote, prev, daily] = await Promise.all([
      data.getQuote(ticker),
      data.getPreviousDay(ticker),
      data.getDailyBars(ticker, "6mo"),
    ]);
    if (!quote.price) return res.status(500).json({ error: `No current price for ${ticker}` });

    const pivots = calculatePivots(prev.high, prev.low, prev.close);
    let chain = { underlying_price: quote.price, contracts: [] };
    let chain_error = null;
    try {
      chain = await data.getOptionChain(ticker);
    } catch (e) {
      chain_error = e.message;
    }

    const recs = buildRecommendations(quote.price, pivots, chain.contracts, ticker);
    const adxData = adx(daily.highs, daily.lows, daily.closes, 14);
    const rsiVal = rsi(daily.closes, 14);
    const macdData = macd(daily.closes);
    const ema8 = ema(daily.closes, 8);
    const ema21 = ema(daily.closes, 21);
    const ema50 = ema(daily.closes, 50);

    res.json({
      timestamp: new Date().toISOString(),
      ticker,
      data_source: process.env.DATA_SOURCE || "yahoo",
      active_source: process.env.DATA_SOURCE || "yahoo",
      spy: quote,
      previous_day: prev,
      pivots,
      forward_levels: buildForwardLevels(daily),
      expiration: getTodayExpiration(),
      recommendations: recs,
      chain_count: chain.contracts.length,
      chain_error,
      indicators: {
        rsi: rsiVal,
        macd: macdData,
        adx: adxData,
        emas: {
          ema8: ema8[ema8.length - 1],
          ema21: ema21[ema21.length - 1],
          ema50: ema50[ema50.length - 1],
        },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
