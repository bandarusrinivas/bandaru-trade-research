// Backtest engine — pure, no I/O. Drives routes/backtest.js.
//
// Event-driven backtest of TECHNICAL-SIGNAL strategies on daily bars. Long-only,
// equity-only P&L (no options). Signals are computed on each bar's close and
// executed at the NEXT bar's open, so there is no look-ahead bias.

import { ema, calculatePivots, ttmSqueeze } from "./indicators.js";

export const START_EQUITY = 10000;

const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// ─────────────────────── indicator series helpers ───────────────────────
export function rsiSeries(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function macdHistSeries(closes) {
  const eF = ema(closes, 12), eS = ema(closes, 26);
  const macdLine = closes.map((_, i) => (eF[i] != null && eS[i] != null ? eF[i] - eS[i] : null));
  const start = macdLine.findIndex((v) => v != null);
  const signal = new Array(closes.length).fill(null);
  if (start >= 0) {
    const sub = macdLine.slice(start).map((v) => v ?? 0);
    const sig = ema(sub, 9);
    for (let i = 0; i < sig.length; i++) if (sig[i] != null) signal[start + i] = sig[i];
  }
  return macdLine.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
}

// ───────────────────────── strategy definitions ─────────────────────────
// Each returns a per-bar signal array: "enter" | "exit" | null.
export const STRATEGIES = {
  ema_cross: {
    label: "EMA 8 / 21 cross",
    build({ closes }) {
      const f = ema(closes, 8), s = ema(closes, 21);
      return closes.map((_, i) => {
        if (i < 1 || f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return null;
        if (f[i - 1] <= s[i - 1] && f[i] > s[i]) return "enter";
        if (f[i - 1] >= s[i - 1] && f[i] < s[i]) return "exit";
        return null;
      });
    },
  },
  rsi_reversal: {
    label: "RSI(14) reversal (30 / 70)",
    build({ closes }) {
      const r = rsiSeries(closes, 14);
      return closes.map((_, i) => {
        if (i < 1 || r[i] == null || r[i - 1] == null) return null;
        if (r[i - 1] < 30 && r[i] >= 30) return "enter";
        if (r[i] >= 70) return "exit";
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
        if (h[i - 1] <= 0 && h[i] > 0) return "enter";
        if (h[i - 1] >= 0 && h[i] < 0) return "exit";
        return null;
      });
    },
  },
  squeeze: {
    label: "TTM squeeze fire",
    maxHold: 12,
    build({ highs, lows, closes }) {
      const sig = new Array(closes.length).fill(null);
      for (let i = 40; i < closes.length; i++) {
        const sq = ttmSqueeze(highs.slice(0, i + 1), lows.slice(0, i + 1), closes.slice(0, i + 1));
        if (sq.fired === "bullish") sig[i] = "enter";
        else if (sq.fired === "bearish") sig[i] = "exit";
      }
      return sig;
    },
  },
  pivot_breakout: {
    label: "Daily pivot breakout (R1 / PP)",
    build({ highs, lows, closes }) {
      return closes.map((_, i) => {
        if (i < 1) return null;
        const pv = calculatePivots(highs[i - 1], lows[i - 1], closes[i - 1]);
        if (closes[i] > pv.R1) return "enter";
        if (closes[i] < pv.PP) return "exit";
        return null;
      });
    },
  },
};

// ───────────────────────────── the engine ───────────────────────────────
export function runBacktest(strategyKey, bars) {
  const strat = STRATEGIES[strategyKey];
  const { opens, highs, lows, closes, timestamps } = bars;
  const n = closes.length;
  const signals = strat.build({ opens, highs, lows, closes });
  const maxHold = strat.maxHold || null;

  const dateOf = (i) => (timestamps?.[i] ? new Date(timestamps[i]).toISOString().slice(0, 10) : `bar ${i}`);

  let equity = START_EQUITY;
  let shares = 0;
  let inPos = false;
  let entryIdx = -1, entryPrice = 0;
  const trades = [];
  const equityCurve = [];
  let barsInPos = 0;

  for (let i = 0; i < n; i++) {
    // Execute the signal raised on the PREVIOUS bar at this bar's open.
    const prevSig = i > 0 ? signals[i - 1] : null;
    const execPrice = opens[i] ?? closes[i];

    if (!inPos && prevSig === "enter" && execPrice > 0) {
      inPos = true;
      entryIdx = i;
      entryPrice = execPrice;
      shares = equity / execPrice;
    } else if (inPos) {
      const heldBars = i - entryIdx;
      const forceExit = maxHold && heldBars >= maxHold;
      if (prevSig === "exit" || forceExit) {
        equity = shares * execPrice;
        const ret = (execPrice - entryPrice) / entryPrice;
        trades.push({
          entry_date: dateOf(entryIdx),
          entry_price: round(entryPrice),
          exit_date: dateOf(i),
          exit_price: round(execPrice),
          bars_held: heldBars,
          return_pct: round(ret * 100, 2),
          pnl: round(shares * execPrice - shares * entryPrice),
          exit_reason: forceExit && prevSig !== "exit" ? "max hold" : "signal",
        });
        inPos = false; shares = 0;
      }
    }

    // Mark-to-market for the equity curve.
    const markEquity = inPos ? shares * (closes[i] ?? execPrice) : equity;
    if (inPos) barsInPos++;
    equityCurve.push({ date: dateOf(i), equity: round(markEquity) });
  }

  // Close any open position at the final bar's close.
  if (inPos) {
    const last = closes[n - 1];
    equity = shares * last;
    trades.push({
      entry_date: dateOf(entryIdx),
      entry_price: round(entryPrice),
      exit_date: dateOf(n - 1),
      exit_price: round(last),
      bars_held: n - 1 - entryIdx,
      return_pct: round(((last - entryPrice) / entryPrice) * 100, 2),
      pnl: round(shares * last - shares * entryPrice),
      exit_reason: "open at end",
    });
    equityCurve[n - 1] = { date: dateOf(n - 1), equity: round(equity) };
  }

  // ───────── stats ─────────
  const wins = trades.filter((t) => t.return_pct > 0);
  const losses = trades.filter((t) => t.return_pct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let peak = -Infinity, maxDD = 0;
  for (const p of equityCurve) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) maxDD = Math.min(maxDD, (p.equity - peak) / peak);
  }

  const years = (timestamps?.[n - 1] && timestamps?.[0])
    ? Math.max((timestamps[n - 1] - timestamps[0]) / (365.25 * 86400000), 0.01)
    : n / 252;
  const totalReturn = (equity - START_EQUITY) / START_EQUITY;
  const buyHold = (closes[n - 1] - closes[0]) / closes[0];

  // Buy-and-hold benchmark curve, normalised to the same starting equity.
  const benchmarkCurve = closes.map((c, i) => ({
    date: dateOf(i),
    equity: round(START_EQUITY * (c / closes[0])),
  }));

  return {
    strategy_label: strat.label,
    trades,
    equity_curve: equityCurve,
    benchmark_curve: benchmarkCurve,
    stats: {
      start_equity: START_EQUITY,
      final_equity: round(equity),
      total_return_pct: round(totalReturn * 100, 2),
      buy_hold_return_pct: round(buyHold * 100, 2),
      cagr_pct: round((Math.pow(equity / START_EQUITY, 1 / years) - 1) * 100, 2),
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      win_rate_pct: trades.length ? round((wins.length / trades.length) * 100, 1) : null,
      avg_win_pct: wins.length ? round(wins.reduce((s, t) => s + t.return_pct, 0) / wins.length, 2) : null,
      avg_loss_pct: losses.length ? round(losses.reduce((s, t) => s + t.return_pct, 0) / losses.length, 2) : null,
      profit_factor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : (grossWin > 0 ? 99 : null),
      max_drawdown_pct: round(maxDD * 100, 2),
      avg_bars_held: trades.length ? round(trades.reduce((s, t) => s + t.bars_held, 0) / trades.length, 1) : null,
      exposure_pct: round((barsInPos / n) * 100, 1),
      best_trade_pct: trades.length ? round(Math.max(...trades.map((t) => t.return_pct)), 2) : null,
      worst_trade_pct: trades.length ? round(Math.min(...trades.map((t) => t.return_pct)), 2) : null,
      bars: n,
    },
  };
}
