import { Router } from "express";
import * as data from "../services/data.js";

const router = Router();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const chain = await data.getOptionChain(ticker);
    res.json({
      ticker,
      current_price: chain.underlying_price,
      chain: chain.contracts,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
