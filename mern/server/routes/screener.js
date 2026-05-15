import { Router } from "express";
import * as yahoo from "../services/yahoo.js";
import { adx, rsi, macd, ema, calculatePivots, ttmSqueeze } from "../services/indicators.js";

const router = Router();

const DEFAULT_LIST = ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "GOOGL", "META",
  "NVDA", "AMD", "TSLA", "AMZN", "JPM", "BAC", "XOM", "UNH"];

// Tier-scored opportunity classifier (mirrors src/screener.py logic)
const OPP_SCORES = {
  "SQUEEZE FIRED BULL": 90, "SQUEEZE FIRED BEAR": 90,
  "BULLISH BREAKOUT": 85, "BEARISH BREAKDOWN": 85,
  "EMA CROSS BULL": 70, "EMA CROSS BEAR": 70,
  "BULLISH BOUNCE": 65, "BEARISH REJECTION": 65,
  "BULLISH MOMENTUM": 50, "BEARISH MOMENTUM": 50,
  "SQUEEZE COILING": 40,
  "NO SIGNAL": 0,
};

async function screenOne(sym) {
  try {
    const daily = await yahoo.getDailyBars(sym, "6mo");
    if (daily.closes.length < 30) return { ticker: sym, error: "insufficient history", score: -1 };
    const cp = daily.closes[daily.closes.length - 1];
    const pp = daily.closes[daily.closes.length - 2];
    const chgPct = pp ? ((cp - pp) / pp) * 100 : 0;
    const pivots = calculatePivots(daily.highs[daily.highs.length - 2], daily.lows[daily.lows.length - 2], pp);
    const e8 = ema(daily.closes, 8);
    const e21 = ema(daily.closes, 21);
    const r = rsi(daily.closes, 14);
    const m = macd(daily.closes);
    const adxData = adx(daily.highs, daily.lows, daily.closes, 14);
    const sq = ttmSqueeze(daily.highs, daily.lows, daily.closes);
    const curVol = daily.volumes[daily.volumes.length - 1];
    const avgVol = daily.volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, daily.volumes.length);
    const volX = avgVol ? curVol / avgVol : null;

    // Classification (highest priority wins)
    let opp = "NO SIGNAL", why = "No active setup", direction = "neutral";
    if (sq.fired === "bullish") { opp = "SQUEEZE FIRED BULL"; why = `TTM squeeze released, momentum ${sq.momentum.toFixed(2)}`; direction = "bull"; }
    else if (sq.fired === "bearish") { opp = "SQUEEZE FIRED BEAR"; why = `TTM squeeze released, momentum ${sq.momentum.toFixed(2)}`; direction = "bear"; }
    else if (cp > (pivots.R1 || Infinity) && volX > 1.5 && cp > pp) { opp = "BULLISH BREAKOUT"; why = `Broke above R1 on ${volX.toFixed(1)}× volume`; direction = "bull"; }
    else if (cp < (pivots.S1 || -Infinity) && volX > 1.5 && cp < pp) { opp = "BEARISH BREAKDOWN"; why = `Broke below S1 on ${volX.toFixed(1)}× volume`; direction = "bear"; }
    else if (e8.length >= 3 && e21.length >= 3) {
      const e8n = e8[e8.length - 1], e8p = e8[e8.length - 2];
      const e21n = e21[e21.length - 1], e21p = e21[e21.length - 2];
      if (e8p && e8n && e21p && e21n) {
        if (e8p <= e21p && e8n > e21n) { opp = "EMA CROSS BULL"; why = "EMA 8 crossed above EMA 21"; direction = "bull"; }
        else if (e8p >= e21p && e8n < e21n) { opp = "EMA CROSS BEAR"; why = "EMA 8 crossed below EMA 21"; direction = "bear"; }
      }
    }
    if (opp === "NO SIGNAL" && adxData.adx >= 25) {
      if (m.histogram > 0 && adxData.trend === "Bullish") { opp = "BULLISH MOMENTUM"; why = `ADX ${adxData.adx} · MACD hist +${m.histogram.toFixed(2)}`; direction = "bull"; }
      else if (m.histogram < 0 && adxData.trend === "Bearish") { opp = "BEARISH MOMENTUM"; why = `ADX ${adxData.adx} · MACD hist ${m.histogram.toFixed(2)}`; direction = "bear"; }
    }
    if (opp === "NO SIGNAL" && sq.in_squeeze) { opp = "SQUEEZE COILING"; why = "Volatility compressed — breakout pending"; direction = "neutral"; }

    return {
      ticker: sym,
      price: Math.round(cp * 100) / 100,
      change_pct: Math.round(chgPct * 100) / 100,
      opportunity: opp,
      direction,
      score: OPP_SCORES[opp] ?? 0,
      why,
      rsi: r != null ? Math.round(r * 10) / 10 : null,
      adx: adxData.adx,
      trend: adxData.trend,
      macd_hist: m.histogram != null ? Math.round(m.histogram * 1000) / 1000 : null,
      volume_x_avg: volX != null ? Math.round(volX * 100) / 100 : null,
    };
  } catch (e) {
    return { ticker: sym, error: `${e.message}`, score: -1 };
  }
}

router.get("/", async (req, res) => {
  const raw = (req.query.symbols || "").toString().trim();
  const symbols = raw ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 50) : DEFAULT_LIST;
  const start = Date.now();
  try {
    // Parallel scan with concurrency cap
    const results = await Promise.all(symbols.map(screenOne));
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    res.json({
      results,
      count: results.length,
      elapsed_ms: Date.now() - start,
      cached: false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
