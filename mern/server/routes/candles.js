// /api/candles?ticker=SPY&interval=5m&period=3d
//
// Returns OHLCV bars for the chart + the prior-day pivot levels and CPR band.
// Defensive: each upstream settles independently, so a missing prior bar
// doesn't blank out the chart when the candles themselves came back fine.

import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots, calculateCPR } from "../services/indicators.js";

const router = Router();

function safe(label, errors, fn) {
  try { return fn(); }
  catch (e) { errors[label] = e?.message || String(e); return null; }
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const interval = (req.query.interval || "5m").toString();
  const period = (req.query.period || "1d").toString();
  // Pass the requested period DIRECTLY to the adapter — each adapter
  // handles its own translation. Yahoo maps 2d/3d → fetch "5d" + trim;
  // Schwab maps 2d/3d → start_datetime N days back. The previous
  // implementation pre-mapped 2d/3d → 5d here, which prevented yahoo.js
  // from knowing the user wanted 2d or 3d (it just saw "5d"), so the
  // trim-to-N-sessions logic in yahoo.js never fired and "3d" always
  // returned 5 days of bars regardless of what the user clicked.

  const [barsR, prevR] = await Promise.allSettled([
    data.getIntradayBars(ticker, interval, period),
    data.getPreviousDay(ticker),
  ]);

  const bars = barsR.status === "fulfilled" && Array.isArray(barsR.value) ? barsR.value : [];
  const prev = prevR.status === "fulfilled" ? prevR.value : null;

  const errors = {};
  if (barsR.status === "rejected") errors.bars = barsR.reason?.message || String(barsR.reason);
  if (prevR.status === "rejected") errors.previous_day = prevR.reason?.message || String(prevR.reason);

  let pivots = null, cpr = null;
  if (prev && prev.high != null && prev.low != null && prev.close != null) {
    pivots = safe("pivots", errors, () => calculatePivots(prev.high, prev.low, prev.close));
    cpr    = safe("cpr",    errors, () => calculateCPR(prev.high, prev.low, prev.close));
  }

  // Always 200 with whatever data we have. Empty bars + errors map is still
  // useful to the client (which renders an empty-state message in that case).
  res.json({
    ticker,
    interval,
    period,
    bars,
    pivots,
    cpr,
    errors: Object.keys(errors).length ? errors : undefined,
  });
});

export default router;
