import { Router } from "express";
import * as yahoo from "../services/yahoo.js";
import { calculatePivots, adx, rsi, macd, ema } from "../services/indicators.js";
import { buildRecommendations, getTodayExpiration } from "../services/analysis.js";

const router = Router();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const [quote, prev, daily] = await Promise.all([
      yahoo.getQuote(ticker),
      yahoo.getPreviousDay(ticker),
      yahoo.getDailyBars(ticker, "6mo"),
    ]);
    if (!quote.price) return res.status(500).json({ error: `No current price for ${ticker}` });

    const pivots = calculatePivots(prev.high, prev.low, prev.close);
    let chain = { underlying_price: quote.price, contracts: [] };
    let chain_error = null;
    try {
      chain = await yahoo.getOptionChain(ticker);
    } catch (e) {
      chain_error = e.message;
    }

    const recs = buildRecommendations(quote.price, pivots, chain.contracts, ticker);
    const adxData = adx(daily.highs, daily.lows, daily.closes, 14);
    const rsiVal = rsi(daily.closes, 14);
    const macdData = macd(daily.closes);
    const ema8 = ema(daily.closes, 8);
    const ema21 = ema(daily.closes, 21);
    const ema50 = ema(daily.closes, 50);

    res.json({
      timestamp: new Date().toISOString(),
      ticker,
      data_source: process.env.DATA_SOURCE || "yahoo",
      active_source: process.env.DATA_SOURCE || "yahoo",
      spy: quote,
      previous_day: prev,
      pivots,
      expiration: getTodayExpiration(),
      recommendations: recs,
      chain_count: chain.contracts.length,
      chain_error,
      indicators: {
        rsi: rsiVal,
        macd: macdData,
        adx: adxData,
        emas: {
          ema8: ema8[ema8.length - 1],
          ema21: ema21[ema21.length - 1],
          ema50: ema50[ema50.length - 1],
        },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
