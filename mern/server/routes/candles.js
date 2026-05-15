import { Router } from "express";
import * as data from "../services/data.js";
import { calculatePivots } from "../services/indicators.js";

const router = Router();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const interval = (req.query.interval || "5m").toString();
  const period = (req.query.period || "1d").toString();
  try {
    const bars = await data.getIntradayBars(ticker, interval, period === "3d" || period === "2d" ? "5d" : period);
    // Pivots from prev daily bar
    const daily = await data.getPreviousDay(ticker);
    const pivots = calculatePivots(daily.high, daily.low, daily.close);
    res.json({ ticker, interval, period, bars, pivots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
