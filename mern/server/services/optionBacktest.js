// services/optionBacktest.js — pure option-strategy backtest engine.
//
// PURPOSE: verify that the platform's trade process actually works by replaying
// CALL and PUT trades at chosen strikes over the last 1/2/3 months.
//
// HONEST DATA NOTE: no feed (Schwab or Yahoo) exposes historical option prices,
// so real past fills cannot be replayed. Instead every option premium is
// reconstructed with Black-Scholes from data that IS available — the
// underlying's historical price plus a volatility estimate (trailing realized
// vol). This is a MODELLED backtest: it correctly captures leverage, theta
// decay and convexity, but it is an estimate, not tick-for-tick real fills.
//
// Engine: walks daily bars; on a directional signal it "buys" a call (bullish)
// or put (bearish) at a strike set by a moneyness offset, with a chosen DTE.
// Each day the option is re-priced as the underlying moves and time decays.
// Exit by premium target/stop, opposite signal, or expiration.

import { ema, ttmSqueeze, calculatePivots } from "./indicators.js";
import { blackScholes } from "./blackscholes.js";
import { rsiSeries, macdHistSeries } from "./backtest.js";

export const START_EQUITY = 10000;
const RISK_FREE = Number(process.env.RISK_FREE_RATE || 0.05);
const YEAR_HOURS = 365 * 24;
const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// Trailing annualised realised volatility (decimal) from closes up to idx.
function realizedVolAt(closes, idx, lookback = 20) {
  const start = Math.max(1, idx - lookback + 1);
  const rets = [];
  for (let i = start; i <= idx; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 5) return 0.20;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - m) ** 2, 0) / rets.length;
  const sig = Math.sqrt(v) * Math.sqrt(252);
  return Math.min(1.5, Math.max(0.08, sig));
}

// ─── directional entry signals: per bar "long" | "short" | null ───
export const DIR_STRATEGIES = {
  ema_cross: {
    label: "EMA 8 / 21 cross",
    build({ closes }) {
      const f = ema(closes, 8), s = ema(closes, 21);
      return closes.map((_, i) => {
        if (i < 1 || f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return null;
        if (f[i - 1] <= s[i - 1] && f[i] > s[i]) return "long";
        if (f[i - 1] >= s[i - 1] && f[i] < s[i]) return "short";
        return null;
      });
    },
  },
  rsi_reversal: {
    label: "RSI(14) reversal",
    build({ closes }) {
      const r = rsiSeries(closes, 14);
      return closes.map((_, i) => {
        if (i < 1 || r[i] == null || r[i - 1] == null) return null;
        if (r[i - 1] < 30 && r[i] >= 30) return "long";
        if (r[i - 1] > 70 && r[i] <= 70) return "short";
        return null;
      });
    },
  },
  macd: {
    label: "MACD histogram flip",
    build({ closes }) {
      const h = macdHistSeries(closes);
      return closes.map((_, i) => {
        if (i < 1 || h[i] == null || h[i - 1] == null) return null;
        if (h[i - 1] <= 0 && h[i] > 0) return "long";
        if (h[i - 1] >= 0 && h[i] < 0) return "short";
        return null;
      });
    },
  },
  squeeze: {
    label: "TTM squeeze fire",
    build({ highs, lows, closes }) {
      const sig = new Array(closes.length).fill(null);
      for (let i = 40; i < closes.length; i++) {
        const sq = ttmSqueeze(highs.slice(0, i + 1), lows.slice(0, i + 1), closes.slice(0, i + 1));
        if (sq.fired === "bullish") sig[i] = "long";
        else if (sq.fired === "bearish") sig[i] = "short";
      }
      return sig;
    },
  },
  pivot_breakout: {
    label: "Daily pivot breakout (R1 / S1)",
    build({ highs, lows, closes }) {
      return closes.map((_, i) => {
        if (i < 2) return null;
        const pv = calculatePivots(highs[i - 1], lows[i - 1], closes[i - 1]);
        const prev = calculatePivots(highs[i - 2], lows[i - 2], closes[i - 2]);
        if (closes[i] > pv.R1 && closes[i - 1] <= prev.R1) return "long";
        if (closes[i] < pv.S1 && closes[i - 1] >= prev.S1) return "short";
        return null;
      });
    },
  },
};

const priceOpt = (S, K, Tyears, sigma, isCall) =>
  blackScholes({ S, K, T: Math.max(Tyears, 0), r: RISK_FREE, sigma, type: isCall ? "call" : "put" }).price;

/**
 * Run the option backtest.
 *   daily  — { opens, highs, lows, closes, timestamps }
 *   p      — { strategy, side, dte, strikeOffset, exitRule, targetPct, stopPct,
 *              lookbackBars }
 */
export function runOptionBacktest(daily, p) {
  const { opens, highs, lows, closes } = daily;
  const n = closes.length;
  const timestamps = daily.timestamps && daily.timestamps.length === n
    ? daily.timestamps
    : closes.map((_, i) => Date.UTC(2000, 0, 1) + i * 86400000);

  const strat = DIR_STRATEGIES[p.strategy] || DIR_STRATEGIES.ema_cross;
  const signals = strat.build({ opens, highs, lows, closes });

  const lookbackBars = Math.min(n - 30, Math.max(10, p.lookbackBars || 42));
  const windowStart = Math.max(50, n - lookbackBars);

  const allowCall = p.side === "call" || p.side === "both";
  const allowPut  = p.side === "put"  || p.side === "both";
  const dte = Math.max(0, p.dte ?? 7);
  const strikeOffset = p.strikeOffset || 0;     // $; + = OTM, - = ITM
  const exitRule = p.exitRule || "target_stop"; // target_stop | signal | expiration
  const targetPct = p.targetPct ?? 0.5;
  const stopPct = p.stopPct ?? 0.5;

  const dateOf = (i) => new Date(timestamps[i]).toISOString().slice(0, 10);

  let equity = START_EQUITY;
  const trades = [];
  const equityCurve = [];
  let pos = null;

  function recordTrade(t) {
    const ret = (t.exit_premium - t.entry_premium) / t.entry_premium;
    const pnl = t.contracts * 100 * (t.exit_premium - t.entry_premium);
    equity = t.equity_before + pnl;
    trades.push({
      ...t,
      return_pct: round(ret * 100, 2),
      pnl: round(pnl),
      equity_after: round(equity),
    });
  }

  // ── 0DTE trade: opens at the bar's open, expires at the bar's close ──
  function run0dte(i, isCall) {
    const S0 = opens[i];
    const K = Math.round(S0) + (isCall ? strikeOffset : -strikeOffset);
    const sigma = realizedVolAt(closes, i, 20);
    const Tentry = 6.5 / YEAR_HOURS;
    const entryPrem = priceOpt(S0, K, Tentry, sigma, isCall);
    if (!isFinite(entryPrem) || entryPrem < 0.03) return; // too cheap to model

    const intrinsicClose = isCall ? Math.max(closes[i] - K, 0) : Math.max(K - closes[i], 0);
    let exitPrem = intrinsicClose, exitReason = "expiration", exitS = closes[i];

    if (exitRule === "target_stop") {
      // Approximate the intraday path from the bar's extremes (mid-session decay).
      const Tmid = Tentry / 2;
      const premBest  = priceOpt(isCall ? highs[i] : lows[i], K, Tmid, sigma, isCall);
      const premWorst = priceOpt(isCall ? lows[i] : highs[i], K, Tmid, sigma, isCall);
      const stopLvl = entryPrem * (1 - stopPct);
      const tgtLvl  = entryPrem * (1 + targetPct);
      if (premWorst <= stopLvl) { exitPrem = stopLvl; exitReason = "stop"; exitS = isCall ? lows[i] : highs[i]; }
      else if (premBest >= tgtLvl) { exitPrem = tgtLvl; exitReason = "target"; exitS = isCall ? highs[i] : lows[i]; }
    }
    const contracts = equity / (entryPrem * 100);
    recordTrade({
      side: isCall ? "CALL" : "PUT", is_call: isCall,
      entry_date: dateOf(i), underlying_entry: round(S0), strike: K, dte: 0,
      iv_used: round(sigma * 100, 1),
      entry_premium: round(entryPrem), contracts: round(contracts, 1),
      exit_date: dateOf(i), underlying_exit: round(exitS),
      exit_premium: round(exitPrem), days_held: 0, exit_reason: exitReason,
      equity_before: equity,
    });
  }

  for (let i = 0; i < n; i++) {
    // ── manage an open multi-day position at bar i ──
    if (pos) {
      const remDays = (pos.expiryTs - timestamps[i]) / 86400000;
      let exitPrem = null, exitReason = null, exitS = null;
      if (remDays <= 0) {
        exitPrem = priceOpt(closes[i], pos.K, 0, pos.sigma, pos.isCall); // intrinsic
        exitReason = "expiration"; exitS = closes[i];
      } else {
        const T = remDays / 365;
        if (exitRule === "target_stop") {
          const premBest  = priceOpt(pos.isCall ? highs[i] : lows[i], pos.K, T, pos.sigma, pos.isCall);
          const premWorst = priceOpt(pos.isCall ? lows[i] : highs[i], pos.K, T, pos.sigma, pos.isCall);
          const stopLvl = pos.entryPrem * (1 - stopPct);
          const tgtLvl  = pos.entryPrem * (1 + targetPct);
          if (premWorst <= stopLvl) { exitPrem = stopLvl; exitReason = "stop"; exitS = pos.isCall ? lows[i] : highs[i]; }
          else if (premBest >= tgtLvl) { exitPrem = tgtLvl; exitReason = "target"; exitS = pos.isCall ? highs[i] : lows[i]; }
        } else if (exitRule === "signal") {
          const sig = i > 0 ? signals[i - 1] : null;
          const opposite = pos.isCall ? sig === "short" : sig === "long";
          if (opposite) {
            exitPrem = priceOpt(opens[i], pos.K, T, pos.sigma, pos.isCall);
            exitReason = "signal"; exitS = opens[i];
          }
        }
      }
      if (exitPrem != null) {
        recordTrade({
          side: pos.isCall ? "CALL" : "PUT", is_call: pos.isCall,
          entry_date: pos.entryDate, underlying_entry: round(pos.S0), strike: pos.K, dte,
          iv_used: round(pos.sigma * 100, 1),
          entry_premium: round(pos.entryPrem), contracts: round(pos.contracts, 1),
          exit_date: dateOf(i), underlying_exit: round(exitS),
          exit_premium: round(exitPrem), days_held: i - pos.entryIdx, exit_reason: exitReason,
          equity_before: pos.equityBefore,
        });
        pos = null;
      }
    }

    // ── mark to market ──
    let mark = equity;
    if (pos) {
      const remDays = Math.max((pos.expiryTs - timestamps[i]) / 86400000, 0);
      const prem = priceOpt(closes[i], pos.K, remDays / 365, pos.sigma, pos.isCall);
      mark = pos.equityBefore + pos.contracts * 100 * (prem - pos.entryPrem);
    }
    if (i >= windowStart) equityCurve.push({ date: dateOf(i), equity: round(mark) });

    // ── entry: signal on bar i-1 executes at bar i open ──
    if (!pos && i > windowStart && i < n - 1) {
      const sig = i > 0 ? signals[i - 1] : null;
      let isCall = null;
      if (sig === "long" && allowCall) isCall = true;
      else if (sig === "short" && allowPut) isCall = false;
      if (isCall !== null) {
        if (dte === 0) {
          run0dte(i, isCall);
        } else {
          const S0 = opens[i];
          const K = Math.round(S0) + (isCall ? strikeOffset : -strikeOffset);
          const sigma = realizedVolAt(closes, i, 20);
          const entryPrem = priceOpt(S0, K, dte / 365, sigma, isCall);
          if (isFinite(entryPrem) && entryPrem >= 0.03) {
            pos = {
              isCall, K, sigma, S0,
              entryIdx: i, entryDate: dateOf(i),
              entryPrem,
              expiryTs: timestamps[i] + dte * 86400000,
              contracts: equity / (entryPrem * 100),
              equityBefore: equity,
            };
          }
        }
      }
    }
  }

  // close any position still open at the final bar
  if (pos) {
    const i = n - 1;
    const remDays = Math.max((pos.expiryTs - timestamps[i]) / 86400000, 0);
    const exitPrem = priceOpt(closes[i], pos.K, remDays / 365, pos.sigma, pos.isCall);
    recordTrade({
      side: pos.isCall ? "CALL" : "PUT", is_call: pos.isCall,
      entry_date: pos.entryDate, underlying_entry: round(pos.S0), strike: pos.K, dte,
      iv_used: round(pos.sigma * 100, 1),
      entry_premium: round(pos.entryPrem), contracts: round(pos.contracts, 1),
      exit_date: dateOf(i), underlying_exit: round(closes[i]),
      exit_premium: round(exitPrem), days_held: i - pos.entryIdx, exit_reason: "open at end",
      equity_before: pos.equityBefore,
    });
    pos = null;
  }

  // ───────────────────────── stats ─────────────────────────
  const wins = trades.filter((t) => t.return_pct > 0);
  const losses = trades.filter((t) => t.return_pct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let peak = -Infinity, maxDD = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    if (peak > 0) maxDD = Math.min(maxDD, (pt.equity - peak) / peak);
  }

  const sideStats = (isCall) => {
    const sub = trades.filter((t) => t.is_call === isCall);
    const w = sub.filter((t) => t.return_pct > 0);
    return {
      trades: sub.length,
      wins: w.length,
      win_rate_pct: sub.length ? round((w.length / sub.length) * 100, 1) : null,
      avg_return_pct: sub.length ? round(sub.reduce((s, t) => s + t.return_pct, 0) / sub.length, 2) : null,
    };
  };

  const benchBase = closes[windowStart] || closes[0];
  const benchmarkCurve = [];
  for (let i = windowStart; i < n; i++) {
    benchmarkCurve.push({ date: dateOf(i), equity: round(START_EQUITY * (closes[i] / benchBase)) });
  }
  const buyHold = (closes[n - 1] - benchBase) / benchBase;

  return {
    trades,
    equity_curve: equityCurve,
    benchmark_curve: benchmarkCurve,
    stats: {
      start_equity: START_EQUITY,
      final_equity: round(equity),
      total_return_pct: round(((equity - START_EQUITY) / START_EQUITY) * 100, 2),
      buy_hold_return_pct: round(buyHold * 100, 2),
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      win_rate_pct: trades.length ? round((wins.length / trades.length) * 100, 1) : null,
      avg_win_pct: wins.length ? round(wins.reduce((s, t) => s + t.return_pct, 0) / wins.length, 2) : null,
      avg_loss_pct: losses.length ? round(losses.reduce((s, t) => s + t.return_pct, 0) / losses.length, 2) : null,
      profit_factor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : (grossWin > 0 ? 99 : null),
      max_drawdown_pct: round(maxDD * 100, 2),
      avg_days_held: trades.length ? round(trades.reduce((s, t) => s + t.days_held, 0) / trades.length, 1) : null,
      best_trade_pct: trades.length ? round(Math.max(...trades.map((t) => t.return_pct)), 2) : null,
      worst_trade_pct: trades.length ? round(Math.min(...trades.map((t) => t.return_pct)), 2) : null,
      expired_worthless: trades.filter((t) => t.exit_reason === "expiration" && t.exit_premium < 0.05).length,
      calls: sideStats(true),
      puts: sideStats(false),
      window_bars: n - windowStart,
    },
  };
}
