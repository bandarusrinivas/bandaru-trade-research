// /api/chain?ticker=SPY — option chain for the Options Chain tab.
//
// Returns 200 with a clean error field on failure rather than 500 so the
// UI can render a friendly message instead of a stack-trace string.

import { Router } from "express";
import * as data from "../services/data.js";

const router = Router();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const chain = await data.getOptionChain(ticker);
    return res.json({
      ticker,
      current_price: chain?.underlying_price ?? null,
      chain: chain?.contracts ?? [],
      available: Array.isArray(chain?.contracts) && chain.contracts.length > 0,
    });
  } catch (e) {
    return res.status(200).json({
      ticker,
      available: false,
      current_price: null,
      chain: [],
      error: e?.message || String(e),
    });
  }
});

export default router;
