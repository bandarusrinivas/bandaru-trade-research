import { Router } from "express";
import * as data from "../services/data.js";

const router = Router();

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "^VIX", "VXX",
  "NVDA", "AAPL", "MSFT", "GOOGL", "META", "TSLA", "AMZN", "AMD"];

router.get("/", async (req, res) => {
  const raw = (req.query.symbols || "").toString().trim();
  const symbols = raw ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 30) : DEFAULT_SYMBOLS;
  try {
    const quotes = await Promise.all(symbols.map(async (sym) => {
      try { return { symbol: sym, ...(await data.getQuote(sym)) }; }
      catch (e) { return { symbol: sym, error: e.message }; }
    }));
    res.json({ quotes });
  } catch (e) {
    res.status(200).json({ quotes: [], error: e?.message || String(e) });
  }
});

export default router;
