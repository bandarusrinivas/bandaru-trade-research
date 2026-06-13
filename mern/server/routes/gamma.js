// /api/gamma?ticker=SPY
//
// Dealer GAMMA EXPOSURE (GEX) estimate from the live option chain.
//
// Method (the standard "naive" retail GEX convention — stated plainly so it
// isn't mistaken for a proprietary dealer-positioning model):
//   • Per contract, $GEX = Γ × OI × 100 × Spot² × 0.01   ($ per 1% move)
//   • Calls count POSITIVE, puts NEGATIVE — i.e. it assumes dealers are long
//     call gamma and short put gamma. Real dealer books vary; this is the
//     common simplifying assumption, not measured positioning.
//   • Γ is taken straight from the feed when the chain provides it (Schwab),
//     otherwise modelled with Black-Scholes from the contract's IV.
//
// Positive total GEX  → dealers dampen moves (pinning / mean-reversion).
// Negative total GEX  → dealers amplify moves (trending / higher volatility).
//
// The chain this serves is the near-term expiration the data feed returns
// (0DTE for the Schwab sidecar), so this is near-term GEX, not all-expiry.

import { Router } from "express";
import * as data from "../services/data.js";
import { blackScholes } from "../services/blackscholes.js";

const router = Router();

const RISK_FREE = Number(process.env.RISK_FREE_RATE || 0.05);
const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// Trading hours remaining in the US session — used only for the BS gamma
// fallback when the feed doesn't supply gamma.
function tradingHoursLeftToday() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const nowMin = et.getHours() * 60 + et.getMinutes();
  const openMin = 9 * 60 + 30, closeMin = 16 * 60;
  if (nowMin <= openMin) return 6.5;
  if (nowMin >= closeMin) return 0;
  return (closeMin - nowMin) / 60;
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();

  try {
    const [quote, chain] = await Promise.all([
      data.getQuote(ticker).catch(() => null),
      data.getOptionChain(ticker).catch(() => null),
    ]);
    const spot = quote?.price || chain?.underlying_price;
    if (!spot) return res.status(200).json({
      ticker, available: false,
      error: `No quote available for ${ticker}.`,
    });

    const contracts = chain?.contracts || [];
    if (!contracts.length) {
      return res.json({
        ticker, spot: round(spot), available: false,
        note: "No option chain available for this symbol right now.",
      });
    }

    // Time-to-expiry for the model fallback (floored so 0DTE gamma stays finite).
    const Tfallback = Math.max(tradingHoursLeftToday(), 0.5) / (365 * 24);

    let feedCount = 0, modelCount = 0;
    const perStrike = new Map();

    for (const c of contracts) {
      const K = c.strike;
      const oi = c.open_interest || 0;
      if (!K || oi <= 0) continue;
      const isCall = c.type === "call";

      // Prefer feed gamma; otherwise model it from IV.
      let g = (typeof c.gamma === "number" && isFinite(c.gamma) && c.gamma > 0) ? c.gamma : null;
      if (g != null) {
        feedCount++;
      } else {
        const ivRaw = c.iv;
        const sigma = (typeof ivRaw === "number" && isFinite(ivRaw) && ivRaw > 0)
          ? (ivRaw > 1 ? ivRaw / 100 : ivRaw)
          : 0.20;
        g = blackScholes({ S: spot, K, T: Tfallback, r: RISK_FREE, sigma, type: isCall ? "call" : "put" }).gamma;
        modelCount++;
      }
      if (!isFinite(g) || g <= 0) continue;

      // $GEX per 1% move; calls +, puts −.
      const dollarGex = g * oi * 100 * spot * spot * 0.01 * (isCall ? 1 : -1);

      if (!perStrike.has(K)) {
        perStrike.set(K, { strike: K, call_gex: 0, put_gex: 0, call_oi: 0, put_oi: 0 });
      }
      const e = perStrike.get(K);
      if (isCall) { e.call_gex += dollarGex; e.call_oi += oi; }
      else        { e.put_gex  += dollarGex; e.put_oi  += oi; }
    }

    const rows = [...perStrike.values()]
      .map((e) => ({ ...e, net_gex: e.call_gex + e.put_gex }))
      .sort((a, b) => a.strike - b.strike);

    if (!rows.length) {
      return res.json({
        ticker, spot: round(spot), available: false,
        note: "Chain returned no contracts with open interest.",
      });
    }

    const total_gex = rows.reduce((s, r) => s + r.net_gex, 0);

    // Call wall = strike holding the most positive net GEX; put wall the most negative.
    let callWall = rows[0], putWall = rows[0];
    for (const r of rows) {
      if (r.net_gex > callWall.net_gex) callWall = r;
      if (r.net_gex < putWall.net_gex) putWall = r;
    }

    // Zero-gamma (flip) estimate — strike where cumulative net GEX crosses zero.
    let cum = 0, prevCum = 0, prevStrike = rows[0].strike;
    let zeroGamma = null;
    for (const r of rows) {
      prevCum = cum;
      cum += r.net_gex;
      if (prevCum === 0 && cum === 0) { prevStrike = r.strike; continue; }
      if ((prevCum <= 0 && cum > 0) || (prevCum >= 0 && cum < 0)) {
        const span = cum - prevCum;
        const frac = span !== 0 ? -prevCum / span : 0;
        zeroGamma = prevStrike + frac * (r.strike - prevStrike);
        break;
      }
      prevStrike = r.strike;
    }

    const regime = total_gex >= 0 ? "positive" : "negative";
    const regime_note = total_gex >= 0
      ? "Positive gamma — dealers hedge against the move (buy dips / sell rips). "
        + "Expect dampened, mean-reverting price action and possible pinning near walls."
      : "Negative gamma — dealers hedge with the move (sell weakness / buy strength). "
        + "Expect amplified, trendier price action and larger swings.";

    // Profile for the chart — strikes within ±8% of spot.
    const lo = spot * 0.92, hi = spot * 1.08;
    const profile = rows
      .filter((r) => r.strike >= lo && r.strike <= hi)
      .map((r) => ({
        strike: r.strike,
        call_gex: Math.round(r.call_gex),
        put_gex: Math.round(r.put_gex),
        net_gex: Math.round(r.net_gex),
        call_oi: r.call_oi,
        put_oi: r.put_oi,
      }));

    res.json({
      ticker,
      spot: round(spot),
      available: true,
      total_gex: Math.round(total_gex),
      regime,
      regime_note,
      zero_gamma: round(zeroGamma),
      call_wall: { strike: callWall.strike, net_gex: Math.round(callWall.net_gex) },
      put_wall: { strike: putWall.strike, net_gex: Math.round(putWall.net_gex) },
      strikes_used: rows.length,
      gamma_source: { feed: feedCount, model: modelCount },
      profile,
      note: "Naive GEX: $ per 1% move, calls positive / puts negative (assumes dealers "
          + "long calls, short puts). Near-term expiration chain only. A modelling "
          + "estimate to gauge volatility regime — not measured dealer positioning.",
    });
  } catch (e) {
    // Graceful 200 with error so the GEX/gamma panel renders an empty state
    // rather than a red error toast.
    res.status(200).json({
      ticker, available: false,
      error: e?.message || String(e),
    });
  }
});

export default router;
