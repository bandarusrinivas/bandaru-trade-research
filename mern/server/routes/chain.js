import { Router } from "express";
import * as yahoo from "../services/yahoo.js";

const router = Router();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const data = await yahoo.getOptionChain(ticker);
    res.json({
      ticker,
      current_price: data.underlying_price,
      chain: data.contracts,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
