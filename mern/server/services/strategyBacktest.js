// services/strategyBacktest.js — multi-leg option STRATEGY scenario backtest.
//
// Pick a strategy, a specific entry DATE, the strikes (center + wing width),
// the expiration (DTE), and optionally override the net PREMIUM. The engine
// reconstructs every leg's premium with Black-Scholes from the underlying's
// real historical price + the entry day's trailing realized volatility, walks
// the position day-by-day from entry to expiration, and builds the expiration
// payoff diagram.
//
// MODELLED: no data feed provides historical option prices, so premiums are
// estimates. Override the net premium with a real fill for an exact cost
// basis. Volatility is held at the entry day's realized vol. Costs, slippage
// and early assignment are not modelled.

import { blackScholes } from "./blackscholes.js";

const RISK_FREE = Number(process.env.RISK_FREE_RATE || 0.05);
const DAY = 86400000;
const round = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function realizedVolAt(closes, idx, lookback = 20) {
  const start = Math.max(1, idx - lookback + 1);
  const rets = [];
  for (let i = start; i <= idx; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 5) return 0.20;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / rets.length;
  return Math.min(1.5, Math.max(0.08, Math.sqrt(v) * Math.sqrt(252)));
}

// Each leg: [type, action, strikeKey, expKey, qty]
//   strikeKey: center | +w | -w | +2w | -2w   (w = wing width)
//   expKey:    main | near | far              (near == main; far = calendar long leg)
export const STRATEGIES = {
  long_call: { label: "Long Call", kind: "debit", profitUncapped: true,
    legs: [["call", "buy", "center", "main", 1]] },
  long_put: { label: "Long Put", kind: "debit", profitUncapped: false,
    legs: [["put", "buy", "center", "main", 1]] },
  bull_call_spread: { label: "Bull Call Spread", kind: "debit", profitUncapped: false,
    legs: [["call", "buy", "center", "main", 1], ["call", "sell", "+w", "main", 1]] },
  bear_put_spread: { label: "Bear Put Spread", kind: "debit", profitUncapped: false,
    legs: [["put", "buy", "center", "main", 1], ["put", "sell", "-w", "main", 1]] },
  straddle: { label: "Long Straddle", kind: "debit", profitUncapped: true,
    legs: [["call", "buy", "center", "main", 1], ["put", "buy", "center", "main", 1]] },
  strangle: { label: "Long Strangle", kind: "debit", profitUncapped: true,
    legs: [["call", "buy", "+w", "main", 1], ["put", "buy", "-w", "main", 1]] },
  iron_condor: { label: "Iron Condor", kind: "credit", profitUncapped: false,
    legs: [["put", "buy", "-2w", "main", 1], ["put", "sell", "-w", "main", 1],
           ["call", "sell", "+w", "main", 1], ["call", "buy", "+2w", "main", 1]] },
  butterfly: { label: "Call Butterfly", kind: "debit", profitUncapped: false,
    legs: [["call", "buy", "-w", "main", 1], ["call", "sell", "center", "main", 2],
           ["call", "buy", "+w", "main", 1]] },
  calendar_spread: { label: "Calendar Spread (calls)", kind: "debit", profitUncapped: false,
    legs: [["call", "sell", "center", "near", 1], ["call", "buy", "center", "far", 1]] },
};

function strikeFromKey(key, center, width) {
  if (key === "+w") return center + width;
  if (key === "-w") return center - width;
  if (key === "+2w") return center + 2 * width;
  if (key === "-2w") return center - 2 * width;
  return center;
}

const legPrice = (S, K, expiryTs, atTs, sigma, type) =>
  blackScholes({
    S, K, T: Math.max(0, (expiryTs - atTs) / DAY) / 365,
    r: RISK_FREE, sigma, type,
  }).price;

/**
 * @param daily  { closes, timestamps }
 * @param p      { strategy, entryDate, centerStrike, width, dte, farDte, premiumOverride }
 */
export function runStrategyBacktest(daily, p) {
  const { closes, timestamps } = daily;
  if (!closes?.length || !timestamps?.length || closes.length !== timestamps.length) {
    return { error: "No usable price history for this symbol." };
  }
  const n = closes.length;

  // Entry bar = first bar on/after the requested entry date.
  const wanted = String(p.entryDate || "");
  let entryIdx = -1;
  for (let i = 0; i < n; i++) {
    if (new Date(timestamps[i]).toISOString().slice(0, 10) >= wanted) { entryIdx = i; break; }
  }
  if (entryIdx < 0) {
    return { error: `Entry date ${wanted} is in the future or beyond available data.` };
  }
  if (entryIdx < 22) {
    return { error: `Not enough history before ${wanted} to model volatility — choose a later date.` };
  }

  const strat = STRATEGIES[p.strategy] || STRATEGIES.long_call;
  const spot = closes[entryIdx];
  const center = (p.centerStrike && isFinite(p.centerStrike)) ? p.centerStrike : Math.round(spot);
  const width = Math.max(1, p.width && isFinite(p.width) ? p.width : Math.max(1, Math.round(spot * 0.02)));
  const dte = Math.max(1, Math.min(365, p.dte || 14));
  const farDte = Math.max(dte + 1, Math.min(400, p.farDte || dte + 21));
  const sigma = realizedVolAt(closes, entryIdx, 20);

  const entryTs = timestamps[entryIdx];
  const mainExpiryTs = entryTs + dte * DAY;
  const farExpiryTs = entryTs + farDte * DAY;
  const expTsOf = (key) => (key === "far" ? farExpiryTs : mainExpiryTs);

  const legs = strat.legs.map(([type, action, sKey, eKey, qty]) => ({
    type, action, qty,
    sign: action === "buy" ? 1 : -1,
    strike: strikeFromKey(sKey, center, width),
    expiryTs: expTsOf(eKey),
  }));

  // Position value (per 1 spread) at underlying price S and time atTs.
  const positionValue = (S, atTs) =>
    legs.reduce((acc, L) =>
      acc + L.sign * L.qty * legPrice(S, L.strike, L.expiryTs, atTs, sigma, L.type) * 100, 0);

  const legDetails = legs.map((L) => ({
    type: L.type,
    action: L.action,
    qty: L.qty,
    strike: round(L.strike),
    expiration: new Date(L.expiryTs).toISOString().slice(0, 10),
    entry_premium: round(legPrice(spot, L.strike, L.expiryTs, entryTs, sigma, L.type)),
  }));

  // Cost basis: modelled, or the user's net-premium override.
  const modeledVEntry = positionValue(spot, entryTs);
  let vEntry = modeledVEntry;
  let premiumBasis = "modeled";
  if (p.premiumOverride != null && isFinite(p.premiumOverride) && p.premiumOverride > 0) {
    vEntry = (strat.kind === "credit" ? -1 : 1) * p.premiumOverride * 100;
    premiumBasis = "override";
  }

  // ── Daily P&L path: entry → expiration (or last available bar) ──
  let endIdx = n - 1;
  for (let i = entryIdx; i < n; i++) {
    if (timestamps[i] > mainExpiryTs) { endIdx = i - 1; break; }
  }
  if (endIdx < entryIdx) endIdx = entryIdx;
  const reachedExpiry = timestamps[n - 1] >= mainExpiryTs;

  const path = [];
  for (let i = entryIdx; i <= endIdx; i++) {
    path.push({
      date: new Date(timestamps[i]).toISOString().slice(0, 10),
      spot: round(closes[i]),
      pnl: round(positionValue(closes[i], timestamps[i]) - vEntry),
    });
  }

  let finalSpot = closes[endIdx];
  let finalPnl = path.length ? path[path.length - 1].pnl : 0;
  if (reachedExpiry) {
    finalPnl = round(positionValue(finalSpot, mainExpiryTs) - vEntry);
    path.push({ date: "expiration", spot: round(finalSpot), pnl: finalPnl });
  }

  // ── Expiration payoff curve across a price range ──
  const lo = spot * 0.75, hi = spot * 1.25, STEPS = 81;
  const payoff = [];
  for (let i = 0; i < STEPS; i++) {
    const S = lo + ((hi - lo) * i) / (STEPS - 1);
    payoff.push({ price: round(S), pnl: round(positionValue(S, mainExpiryTs) - vEntry) });
  }
  const maxProfit = Math.max(...payoff.map((q) => q.pnl));
  const maxLoss = Math.min(...payoff.map((q) => q.pnl));

  const breakevens = [];
  for (let i = 1; i < payoff.length; i++) {
    const a = payoff[i - 1], b = payoff[i];
    if ((a.pnl <= 0 && b.pnl > 0) || (a.pnl >= 0 && b.pnl < 0)) {
      const frac = a.pnl === b.pnl ? 0 : -a.pnl / (b.pnl - a.pnl);
      breakevens.push(round(a.price + frac * (b.price - a.price)));
    }
  }

  const usesFar = strat.legs.some((L) => L[3] === "far");

  return {
    strategy: p.strategy,
    strategy_label: strat.label,
    kind: strat.kind,
    profit_uncapped: !!strat.profitUncapped,
    entry_date: new Date(entryTs).toISOString().slice(0, 10),
    entry_spot: round(spot),
    center_strike: round(center),
    width: round(width),
    dte,
    far_dte: usesFar ? farDte : null,
    expiration_date: new Date(mainExpiryTs).toISOString().slice(0, 10),
    iv_used: round(sigma * 100, 1),
    legs: legDetails,
    modeled_premium: round(Math.abs(modeledVEntry) / 100),
    net_premium: round(Math.abs(vEntry) / 100),
    net_premium_per_contract: round(Math.abs(vEntry)),
    premium_basis: premiumBasis,
    max_profit: round(maxProfit),
    max_loss: round(maxLoss),
    breakevens,
    payoff_curve: payoff,
    path,
    outcome: {
      expired: reachedExpiry,
      final_spot: round(finalSpot),
      final_pnl: finalPnl,
      status: reachedExpiry
        ? `Closed at expiration — ${finalPnl >= 0 ? "PROFIT" : "LOSS"} of $${Math.abs(round(finalPnl))}`
        : `Still open — last marked P&L $${round(finalPnl)} (expiration ${new Date(mainExpiryTs).toISOString().slice(0, 10)} not yet reached)`,
    },
    note: "Modelled with Black-Scholes from the underlying's historical price and "
        + "the entry day's realized volatility (held constant). No feed provides "
        + "historical option prices — override the net premium with a real fill "
        + "for an exact cost basis. Costs, slippage and early assignment are not "
        + "modelled.",
  };
}
