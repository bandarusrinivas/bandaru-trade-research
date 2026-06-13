// /api/pivot-stops?ticker=SPY&lookback=60
//
// Two related things in one place:
//
//  1. STOP LADDER — given the current price and today's floor-trader pivots,
//     where a trailing stop should sit and how it ratchets up (for a long)
//     or down (for a short) as price travels from one pivot zone to the next.
//     The stop anchors to the pivot just past the position, minus an ATR-based
//     buffer so a routine wick doesn't trip it.
//
//  2. SUPPORT/RESISTANCE VALIDATION — a backtest of the pivot levels over the
//     last `lookback` sessions. For every past day we recompute that day's
//     pivots from the prior bar, then check whether each level was tested and
//     whether it held.
//
// Defensive: settles the two upstream calls independently so a Yahoo quote
// rate-limit doesn't blank out the panel when daily bars came back fine —
// and surfaces a clean errors map instead of a 500.

import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots, atr } from "../services/indicators.js";

const router = Router();

const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

const LEVEL_ROLE = {
  S3: "support", S2: "support", S1: "support", PP: "support",
  R1: "resistance", R2: "resistance", R3: "resistance",
};

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const lookback = Math.min(180, Math.max(20, parseInt(req.query.lookback || "60", 10)));

  const [quoteR, dailyR] = await Promise.allSettled([
    data.getQuote(ticker),
    data.getDailyBars(ticker, "1y"),
  ]);

  const errors = {};
  const quote = quoteR.status === "fulfilled" ? quoteR.value : null;
  const daily = dailyR.status === "fulfilled" ? dailyR.value : null;
  if (quoteR.status === "rejected") errors.quote = quoteR.reason?.message || String(quoteR.reason);
  if (dailyR.status === "rejected") errors.daily = dailyR.reason?.message || String(dailyR.reason);

  const price = quote?.price ?? null;
  // If we have neither a price nor any history, the panel can't render.
  if (price == null && (!daily?.closes || daily.closes.length < 30)) {
    return res.status(200).json({
      ticker, available: false, errors,
      message: "Pivot stops unavailable — data sources couldn't supply quote or history.",
    });
  }

  try {
    let pivots = null, atr14 = null, buffer = null, levels = [];
    let zoneIdx = -1, below = null, above = null, current_zone = null;
    let long_stop = null, short_stop = null, ladder = [];
    let validation = null;

    if (daily?.closes && daily.closes.length >= 30) {
      const { highs, lows, closes, opens } = daily;
      const N = closes.length;
      pivots = calculatePivots(highs[N - 1], lows[N - 1], closes[N - 1]);
      atr14 = atr(highs, lows, closes, 14) || (price ? price * 0.01 : null);
      buffer = round(Math.max((price || closes[N - 1]) * 0.0012, (atr14 || 0) * 0.2));

      levels = ["S3", "S2", "S1", "PP", "R1", "R2", "R3"]
        .map((name) => ({ name, value: pivots[name] }))
        .filter((l) => l.value != null && isFinite(l.value));

      const refPrice = price ?? closes[N - 1];
      for (let i = 0; i < levels.length; i++) {
        if (refPrice >= levels[i].value) zoneIdx = i;
      }
      below = zoneIdx >= 0 ? levels[zoneIdx] : null;
      above = zoneIdx + 1 < levels.length ? levels[zoneIdx + 1] : null;
      current_zone = below && above ? `${below.name} → ${above.name}`
                   : below ? `above ${below.name}`
                   : `below ${levels[0]?.name || "—"}`;

      ladder = levels.map((lvl, i) => {
        const upper = levels[i + 1] || null;
        return {
          zone: upper ? `${lvl.name} → ${upper.name}` : `above ${lvl.name}`,
          lower_level: lvl.name,
          lower_value: round(lvl.value),
          upper_level: upper?.name || null,
          upper_value: upper ? round(upper.value) : null,
          long_stop: round(lvl.value - buffer),
          current: i === zoneIdx,
        };
      });

      long_stop = (price && below)
        ? {
            anchor: below.name,
            anchor_value: round(below.value),
            stop_price: round(below.value - buffer),
            risk_per_share: round(price - (below.value - buffer)),
            risk_pct: round(((price - (below.value - buffer)) / price) * 100, 2),
          }
        : { anchor: null, note: price ? "Price is below all pivots." : "No live quote — long-stop offset unknown." };

      short_stop = (price && above)
        ? {
            anchor: above.name,
            anchor_value: round(above.value),
            stop_price: round(above.value + buffer),
            risk_per_share: round((above.value + buffer) - price),
            risk_pct: round((((above.value + buffer) - price) / price) * 100, 2),
          }
        : { anchor: null, note: price ? "Price is above all pivots." : "No live quote — short-stop offset unknown." };

      // ── Validation backtest — wrapped so an indicator hiccup doesn't
      // blank the whole panel.
      try {
        const stats = {};
        for (const name of Object.keys(LEVEL_ROLE)) {
          stats[name] = { tests: 0, holds: 0, breaks: 0, overshoot: [] };
        }
        const start = Math.max(1, N - lookback);
        for (let d = start; d < N; d++) {
          const pv = calculatePivots(highs[d - 1], lows[d - 1], closes[d - 1]);
          const o = opens[d], h = highs[d], l = lows[d], c = closes[d];
          if ([o, h, l, c].some((v) => v == null)) continue;
          for (const [name, role] of Object.entries(LEVEL_ROLE)) {
            const lvl = pv[name];
            if (lvl == null) continue;
            if (role === "support") {
              if (o > lvl && l <= lvl) {
                stats[name].tests++;
                if (c >= lvl) { stats[name].holds++; stats[name].overshoot.push(lvl - l); }
                else            stats[name].breaks++;
              }
            } else {
              if (o < lvl && h >= lvl) {
                stats[name].tests++;
                if (c <= lvl) { stats[name].holds++; stats[name].overshoot.push(h - lvl); }
                else            stats[name].breaks++;
              }
            }
          }
        }
        validation = {
          lookback_sessions: N - start,
          levels: Object.entries(stats).map(([name, s]) => {
            const avgOvershoot = s.overshoot.length
              ? s.overshoot.reduce((a, b) => a + b, 0) / s.overshoot.length : null;
            return {
              level: name,
              role: LEVEL_ROLE[name],
              current_value: round(pivots[name]),
              tests: s.tests, holds: s.holds, breaks: s.breaks,
              hold_rate_pct: s.tests ? round((s.holds / s.tests) * 100, 1) : null,
              avg_wick_through: round(avgOvershoot, 2),
            };
          }),
        };
      } catch (e) {
        errors.validation = e?.message || String(e);
      }
    }

    return res.json({
      ticker,
      available: pivots != null,
      price: round(price),
      atr_14: round(atr14),
      buffer,
      pivots: pivots
        ? Object.fromEntries(Object.entries(pivots).map(([k, v]) => [k, round(v)]))
        : null,
      current_zone,
      long_stop,
      short_stop,
      ladder,
      validation,
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch (e) {
    res.status(200).json({
      ticker, available: false,
      errors: { ...errors, top_level: e?.message || String(e) },
    });
  }
});

export default router;
