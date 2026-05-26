// Pivot-anchored 0DTE recommendations + market stats — ported from src/analysis.py.

import { ttmSqueeze } from "./indicators.js";

export function nearestStrike(strikes, target) {
  return strikes.reduce((best, s) =>
    Math.abs(s - target) < Math.abs(best - target) ? s : best, strikes[0]);
}

export function buildRecommendations(currentPrice, pivots, contracts, ticker = "SPY") {
  if (!contracts?.length || !Object.keys(pivots || {}).length) return [];
  const calls = contracts.filter((c) => c.type === "call" && c.strike)
    .sort((a, b) => a.strike - b.strike);
  const puts = contracts.filter((c) => c.type === "put" && c.strike)
    .sort((a, b) => a.strike - b.strike);
  const resistances = Object.entries(pivots).filter(([_, v]) => v > currentPrice).sort((a, b) => a[1] - b[1]);
  const supports = Object.entries(pivots).filter(([_, v]) => v < currentPrice).sort((a, b) => b[1] - a[1]);

  const recs = [];
  const atm = Math.round(currentPrice);

  // 1. Bullish breakout
  if (resistances.length && calls.length) {
    const [nrName, nrLevel] = resistances[0];
    const nextR = resistances[1] || null;
    const strike = nearestStrike(calls.map((c) => c.strike), atm);
    const call = calls.find((c) => c.strike === strike);
    const delta = 0.55;
    const target = nextR ? nextR[1] : nrLevel + (nrLevel - currentPrice);
    const move = target - currentPrice;
    const projected = call.mid + delta * move;
    recs.push({
      id: "bull_call_break",
      strategy: `Long CALL — Break above ${nrName} (${nrLevel})`,
      direction: "bullish",
      type: "CALL",
      strike: call.strike,
      ticker: call.ticker,
      current_premium: call.mid,
      entry_trigger: `${ticker} closes a 5-min candle above ${nrLevel}`,
      entry_spy_price: nrLevel,
      profit_target_spy: Math.round(target * 100) / 100,
      profit_target_premium: Math.round(projected * 100) / 100,
      stop_loss_premium: Math.round(call.mid * 0.5 * 100) / 100,
      stop_loss_spy: Math.round((nrLevel - 0.3) * 100) / 100,
      reasoning: `Resistance at ${nrName} (${nrLevel}). Break targets ${target.toFixed(2)}.`,
    });
  }

  // 2. Bearish breakdown
  if (supports.length && puts.length) {
    const [nsName, nsLevel] = supports[0];
    const nextS = supports[1] || null;
    const strike = nearestStrike(puts.map((p) => p.strike), atm);
    const put = puts.find((p) => p.strike === strike);
    const delta = 0.55;
    const target = nextS ? nextS[1] : nsLevel - (currentPrice - nsLevel);
    const move = currentPrice - target;
    const projected = put.mid + delta * move;
    recs.push({
      id: "bear_put_break",
      strategy: `Long PUT — Break below ${nsName} (${nsLevel})`,
      direction: "bearish",
      type: "PUT",
      strike: put.strike,
      ticker: put.ticker,
      current_premium: put.mid,
      entry_trigger: `${ticker} closes a 5-min candle below ${nsLevel}`,
      entry_spy_price: nsLevel,
      profit_target_spy: Math.round(target * 100) / 100,
      profit_target_premium: Math.round(projected * 100) / 100,
      stop_loss_premium: Math.round(put.mid * 0.5 * 100) / 100,
      stop_loss_spy: Math.round((nsLevel + 0.3) * 100) / 100,
      reasoning: `Support at ${nsName} (${nsLevel}). Breakdown targets ${target.toFixed(2)}.`,
    });
  }
  return recs;
}

export function getTodayExpiration() {
  // ET-aware YYYY-MM-DD
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.toISOString().slice(0, 10);
}

// ─────────────── "Exploding stocks" / Momentum Surge detector ───────────────
// Six-criterion bundle inspired by community ThinkorSwim "exploding stocks"
// scanners — flags when the current ticker is showing the classic surge
// profile (volume + breakout + trend) RIGHT NOW on the daily timeframe.
//
//   1. Rvol ≥ 2×  (today's volume vs the 20 prior full days' average)
//   2. Price > prior-day high
//   3. TTM Squeeze fired bullish
//   4. ADX > 20
//   5. RSI in the 55–75 band
//   6. Day-over-day change > 1.5%
//
// Each criterion is a hard yes/no; score is 0–6; verdict is BULL when at least
// 4 of the 6 are met, else WAIT. Planning signal — NOT a trade recommendation.
const _round = (n, d = 2) =>
  n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;

export function buildMomentumSurge(quote, prev, daily, rsiVal, adxData) {
  if (!quote || !prev || !daily?.volumes?.length) return null;

  // 1. Relative volume — today vs the 20 prior full days.
  const prior = daily.volumes.slice(-21, -1).filter((v) => v && isFinite(v));
  const avgVol = prior.length
    ? prior.reduce((a, b) => a + b, 0) / prior.length
    : 0;
  const rvol = avgVol > 0 ? (quote.day_volume || 0) / avgVol : 0;
  const rvolMet = rvol >= 2;

  // 2. Break of prior-day high.
  const pdh = prev.high;
  const pdhBreak = quote.price != null && pdh != null && quote.price > pdh;

  // 3. TTM Squeeze fired bullish on the daily timeframe.
  const sq = ttmSqueeze(daily.highs, daily.lows, daily.closes);
  const squeezeFiredBull = sq?.fired === "bullish";

  // 4. ADX > 20 (developing / strong trend).
  const adxVal = adxData?.adx;
  const adxMet = adxVal != null && adxVal > 20;

  // 5. RSI in the trending-bull band (55–75).
  const rsiMet = rsiVal != null && rsiVal >= 55 && rsiVal <= 75;

  // 6. Day-over-day change > 1.5%.
  const chg = quote.change_pct;
  const chgMet = chg != null && chg > 1.5;

  const criteria = [
    { id: "rvol",    label: "Rvol ≥ 2× (today vs 20-day avg)",
      value: _round(rvol, 2),         threshold: 2,           met: rvolMet },
    { id: "pdh",     label: "Above prior-day high",
      value: _round(quote.price, 2),  threshold: _round(pdh, 2), met: pdhBreak },
    { id: "squeeze", label: "TTM Squeeze fired bullish",
      value: sq?.fired || "not fired", threshold: "bullish",  met: squeezeFiredBull },
    { id: "adx",     label: "ADX > 20 (trend strength)",
      value: _round(adxVal, 1),       threshold: 20,          met: adxMet },
    { id: "rsi",     label: "RSI 55–75",
      value: _round(rsiVal, 1),       threshold: "55–75", met: rsiMet },
    { id: "change",  label: "Change > 1.5%",
      value: _round(chg, 2),          threshold: 1.5,         met: chgMet },
  ];
  const score = criteria.reduce((n, c) => n + (c.met ? 1 : 0), 0);
  const verdict = score >= 4 ? "BULL" : "WAIT";

  return {
    score, max: 6, verdict, criteria,
    rvol:           _round(rvol, 2),
    pdh:            _round(pdh, 2),
    avg_volume_20d: _round(avgVol, 0),
  };
}
