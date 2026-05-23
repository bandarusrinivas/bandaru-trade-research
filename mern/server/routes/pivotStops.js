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
//     whether it held. The result is an honest hold-rate per level so the
//     trader knows which pivots actually behave as support/resistance for
//     this symbol — not an assumption that they always do.

import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots, atr } from "../services/indicators.js";

const router = Router();

const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// Roles: supports want price to stay above; resistances want price to stay below.
const LEVEL_ROLE = {
  S3: "support", S2: "support", S1: "support", PP: "support",
  R1: "resistance", R2: "resistance", R3: "resistance",
};

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const lookback = Math.min(180, Math.max(20, parseInt(req.query.lookback || "60", 10)));

  try {
    const [quote, daily] = await Promise.all([
      data.getQuote(ticker),
      data.getDailyBars(ticker, "1y"),
    ]);
    const price = quote?.price;
    if (!price) return res.status(404).json({ error: `No quote for ${ticker}` });

    const { highs, lows, closes, opens } = daily;
    const N = closes?.length || 0;
    if (N < 30) return res.status(404).json({ error: `Insufficient history for ${ticker}` });

    // Pivots from the most recent completed daily bar.
    const pivots = calculatePivots(highs[N - 1], lows[N - 1], closes[N - 1]);
    const atr14 = atr(highs, lows, closes, 14) || price * 0.01;
    // Buffer: enough to clear a typical wick, not so wide it gives back the trade.
    const buffer = round(Math.max(price * 0.0012, atr14 * 0.2));

    // Ordered pivot ladder, low → high.
    const levels = ["S3", "S2", "S1", "PP", "R1", "R2", "R3"]
      .map((name) => ({ name, value: pivots[name] }))
      .filter((l) => l.value != null && isFinite(l.value));

    // Which zone is price in? zoneIdx = index of the highest level at/below price.
    let zoneIdx = -1;
    for (let i = 0; i < levels.length; i++) {
      if (price >= levels[i].value) zoneIdx = i;
    }
    const below = zoneIdx >= 0 ? levels[zoneIdx] : null;
    const above = zoneIdx + 1 < levels.length ? levels[zoneIdx + 1] : null;
    const current_zone = below && above ? `${below.name} → ${above.name}`
                       : below && !above ? `above ${below.name}`
                       : `below ${levels[0].name}`;

    // Stop ladder for a LONG — as price climbs, the stop ratchets to the
    // pivot just below the new zone.
    const ladder = levels.map((lvl, i) => {
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

    // Concrete current recommendations.
    const long_stop = below
      ? {
          anchor: below.name,
          anchor_value: round(below.value),
          stop_price: round(below.value - buffer),
          risk_per_share: round(price - (below.value - buffer)),
          risk_pct: round(((price - (below.value - buffer)) / price) * 100, 2),
        }
      : { anchor: null, note: "Price is below all pivots — no pivot support beneath it." };

    const short_stop = above
      ? {
          anchor: above.name,
          anchor_value: round(above.value),
          stop_price: round(above.value + buffer),
          risk_per_share: round((above.value + buffer) - price),
          risk_pct: round((((above.value + buffer) - price) / price) * 100, 2),
        }
      : { anchor: null, note: "Price is above all pivots — no pivot resistance above it." };

    // ───────────── Support / resistance validation backtest ─────────────
    // For each of the last `lookback` sessions, recompute that day's pivots
    // from the prior bar and test whether each level held.
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
          // Tested if price opened above the level and traded down to it.
          if (o > lvl && l <= lvl) {
            stats[name].tests++;
            if (c >= lvl) {
              stats[name].holds++;
              stats[name].overshoot.push(lvl - l); // how far the wick pierced
            } else {
              stats[name].breaks++;
            }
          }
        } else {
          // Resistance: opened below the level and traded up into it.
          if (o < lvl && h >= lvl) {
            stats[name].tests++;
            if (c <= lvl) {
              stats[name].holds++;            // held = rejected here
              stats[name].overshoot.push(h - lvl);
            } else {
              stats[name].breaks++;           // broke = closed through
            }
          }
        }
      }
    }

    const validation = Object.entries(stats).map(([name, s]) => {
      const avgOvershoot = s.overshoot.length
        ? s.overshoot.reduce((a, b) => a + b, 0) / s.overshoot.length
        : null;
      return {
        level: name,
        role: LEVEL_ROLE[name],
        current_value: round(pivots[name]),
        tests: s.tests,
        holds: s.holds,
        breaks: s.breaks,
        hold_rate_pct: s.tests ? round((s.holds / s.tests) * 100, 1) : null,
        avg_wick_through: round(avgOvershoot, 2),
      };
    });

    res.json({
      ticker,
      price: round(price),
      atr_14: round(atr14),
      buffer,
      pivots: Object.fromEntries(Object.entries(pivots).map(([k, v]) => [k, round(v)])),
      current_zone,
      long_stop,
      short_stop,
      ladder,
      validation: {
        lookback_sessions: N - start,
        levels: validation,
        note: "Hold-rate is the share of past tests where the level was respected "
            + "(support closed above / resistance closed below). avg_wick_through "
            + "shows how far price typically pierced the level before reversing — a "
            + "guide for how much buffer to give a stop. This is a historical "
            + "tendency, not a guarantee.",
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message, ticker });
  }
});

export default router;
