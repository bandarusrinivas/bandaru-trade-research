// /api/backtest — technical-signal strategy backtester.
//
//   mode=equity (default)  — long-only equity backtest (shares).
//     ?ticker=SPY&strategy=ema_cross&period=2y
//
//   mode=option            — Black-Scholes-modelled CALL / PUT backtest.
//     ?ticker=SPY&strategy=ema_cross&side=both&dte=7&strike_offset=0
//      &exit=target_stop&target_pct=0.5&stop_pct=0.5&lookback=2mo
//
// Both engines live in services/ so they stay pure and unit-testable.

import { Router } from "express";
import * as data from "../services/data.js";
import { runBacktest, STRATEGIES } from "../services/backtest.js";
import { runOptionBacktest, DIR_STRATEGIES } from "../services/optionBacktest.js";

const router = Router();

// Lookback windows for the option backtest, in trading days (~21/mo).
const LOOKBACK_BARS = { "1mo": 21, "2mo": 42, "3mo": 63 };

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const mode = (req.query.mode || "equity").toString().toLowerCase() === "option"
    ? "option" : "equity";
  const strategy = (req.query.strategy || "ema_cross").toString();

  try {
    // ─────────────────────────── OPTION MODE ───────────────────────────
    if (mode === "option") {
      if (!DIR_STRATEGIES[strategy]) {
        return res.status(400).json({
          error: `Unknown strategy "${strategy}"`,
          available: Object.keys(DIR_STRATEGIES),
        });
      }
      const side = ["call", "put", "both"].includes((req.query.side || "").toString())
        ? req.query.side.toString() : "both";
      const dte = Math.max(0, Math.min(45, parseInt(req.query.dte ?? "7", 10) || 0));
      const strikeOffset = Math.max(-10, Math.min(10, parseInt(req.query.strike_offset ?? "0", 10) || 0));
      const exitRule = ["target_stop", "signal", "expiration"].includes((req.query.exit || "").toString())
        ? req.query.exit.toString() : "target_stop";
      const targetPct = Math.max(0.05, Math.min(5, parseFloat(req.query.target_pct ?? "0.5") || 0.5));
      const stopPct = Math.max(0.05, Math.min(1, parseFloat(req.query.stop_pct ?? "0.5") || 0.5));
      const lookbackKey = LOOKBACK_BARS[(req.query.lookback || "2mo").toString()] ? req.query.lookback.toString() : "2mo";

      // Pull 6 months so indicators have warm-up before the trading window.
      const daily = await data.getDailyBars(ticker, "6mo");
      if (!daily?.closes?.length || daily.closes.length < 60) {
        return res.status(404).json({ error: `Not enough price history for ${ticker}` });
      }

      const result = runOptionBacktest(daily, {
        strategy, side, dte, strikeOffset, exitRule, targetPct, stopPct,
        lookbackBars: LOOKBACK_BARS[lookbackKey],
      });

      return res.json({
        ticker, mode: "option", strategy, side, dte,
        strike_offset: strikeOffset, exit: exitRule,
        target_pct: targetPct, stop_pct: stopPct, lookback: lookbackKey,
        strategies: Object.fromEntries(Object.entries(DIR_STRATEGIES).map(([k, v]) => [k, v.label])),
        ...result,
        note: "MODELLED option backtest. Premiums are reconstructed with "
            + "Black-Scholes from the underlying's historical price and trailing "
            + "realized volatility — no feed provides historical option prices. "
            + "0DTE trades are modelled open-to-close on daily bars. Costs, "
            + "slippage, bid/ask spread and IV term-structure are not modelled. "
            + "An estimate of whether the process works — not real fills.",
      });
    }

    // ─────────────────────────── EQUITY MODE ───────────────────────────
    if (!STRATEGIES[strategy]) {
      return res.status(400).json({
        error: `Unknown strategy "${strategy}"`,
        available: Object.keys(STRATEGIES),
      });
    }
    const periodRaw = (req.query.period || "2y").toString();
    const period = ["1y", "2y", "5y"].includes(periodRaw) ? periodRaw : "2y";

    const daily = await data.getDailyBars(ticker, period);
    if (!daily?.closes?.length || daily.closes.length < 60) {
      return res.status(404).json({ error: `Not enough price history for ${ticker}` });
    }
    const result = runBacktest(strategy, daily);
    res.json({
      ticker, mode: "equity", strategy, period,
      strategies: Object.fromEntries(Object.entries(STRATEGIES).map(([k, v]) => [k, v.label])),
      ...result,
      note: "Long-only, equity-only. Signals fire on the close and execute at the "
          + "next open (no look-ahead). Costs, slippage and dividends are not "
          + "modelled. Past performance does not predict future results.",
    });
  } catch (e) {
    res.status(500).json({ error: e.message, ticker });
  }
});

export default router;
