// Pivot-anchored 0DTE recommendations + market stats — ported from src/analysis.py.

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
