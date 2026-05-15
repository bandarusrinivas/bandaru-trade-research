import { Router } from "express";
import Trade from "../models/Trade.js";

const router = Router();

// GET /api/trades?status=open|closed|all
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
    const trades = await Trade.find(filter).sort({ opened_at: -1 }).lean();
    res.json({ trades });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trades — log a new open trade
router.post("/", async (req, res) => {
  try {
    const trade = await Trade.create(req.body);
    res.status(201).json(trade);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/trades/:id — close a trade (sets exit_price + closed_at)
router.patch("/:id", async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.exit_price != null) {
      update.status = "closed";
      update.closed_at = new Date();
    }
    const trade = await Trade.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!trade) return res.status(404).json({ error: "not found" });
    res.json(trade);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/trades/:id
router.delete("/:id", async (req, res) => {
  try {
    await Trade.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
