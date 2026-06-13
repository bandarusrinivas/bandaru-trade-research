// /api/oi-flow?ticker=SPY
//
// OPEN-INTEREST FLOW — day-over-day change in option open interest, with the
// emphasis the request asked for: where CALL open interest is growing while
// price is rising (fresh bullish positioning).
//
// The data feeds expose only the current day's OI, so this route snapshots the
// chain once per trading day into MongoDB and diffs the two most recent days.
// On the very first day for a symbol there is nothing to diff yet — it returns
// a "baseline captured" response and the comparison appears the next session.
//
// POST /api/oi-flow/snapshot?ticker=SPY  — force-capture today's snapshot
// (handy for an end-of-day scheduled task).

import { Router } from "express";
import mongoose from "mongoose";
import * as data from "../services/data.js";
import OISnapshot from "../models/OISnapshot.js";

const router = Router();

const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// Today's date in US/Eastern as YYYY-MM-DD.
function etDate() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

function mongoReady() {
  return mongoose.connection?.readyState === 1;
}

// Capture today's chain into a snapshot (idempotent unless force=true).
async function captureSnapshot(ticker, force = false) {
  const date = etDate();
  const existing = await OISnapshot.findOne({ ticker, date });
  if (existing && !force) return existing;

  const [quote, chain] = await Promise.all([
    data.getQuote(ticker).catch(() => null),
    data.getOptionChain(ticker).catch(() => null),
  ]);
  const spot = quote?.price || chain?.underlying_price || null;
  const contracts = (chain?.contracts || [])
    .filter((c) => c.strike && (c.type === "call" || c.type === "put"))
    .map((c) => ({
      strike: c.strike,
      type: c.type,
      open_interest: c.open_interest || 0,
      volume: c.volume || 0,
      last: c.last ?? c.mid ?? null,
      iv: c.iv ?? null,
    }));
  if (!contracts.length) return existing || null;

  const doc = { ticker, date, spot, contracts };
  return OISnapshot.findOneAndUpdate({ ticker, date }, doc, {
    upsert: true, new: true, setDefaultsOnInsert: true,
  });
}

// Build the day-over-day comparison from two snapshots.
function compare(today, prior) {
  const key = (c) => `${c.type}:${c.strike}`;
  const priorMap = new Map((prior.contracts || []).map((c) => [key(c), c]));
  const todayMap = new Map((today.contracts || []).map((c) => [key(c), c]));

  const priceChange = (today.spot != null && prior.spot != null)
    ? today.spot - prior.spot : null;
  const priceUp = priceChange != null && priceChange > 0;

  function rowsFor(optType) {
    const strikes = new Set();
    for (const c of today.contracts || []) if (c.type === optType) strikes.add(c.strike);
    for (const c of prior.contracts || []) if (c.type === optType) strikes.add(c.strike);
    const rows = [];
    for (const strike of strikes) {
      const t = todayMap.get(`${optType}:${strike}`);
      const p = priorMap.get(`${optType}:${strike}`);
      const todayOI = t?.open_interest || 0;
      const priorOI = p?.open_interest || 0;
      const change = todayOI - priorOI;
      if (change === 0 && todayOI === 0) continue;
      let signal;
      if (change > 0) {
        signal = optType === "call"
          ? (priceUp ? "OI↑ + price↑ — bullish call accumulation"
                     : "OI↑ + price↓ — call writing / hedging")
          : (priceUp ? "OI↑ + price↑ — put writing / hedging"
                     : "OI↑ + price↓ — bearish put accumulation");
      } else if (change < 0) {
        signal = "OI unwinding — positions closed";
      } else {
        signal = "no OI change";
      }
      rows.push({
        strike,
        prior_oi: priorOI,
        today_oi: todayOI,
        oi_change: change,
        oi_change_pct: priorOI ? round((change / priorOI) * 100, 1) : null,
        today_volume: t?.volume || 0,
        bullish_accum: optType === "call" && change > 0 && priceUp,
        signal,
      });
    }
    return rows.sort((a, b) => b.oi_change - a.oi_change);
  }

  const calls = rowsFor("call");
  const puts = rowsFor("put");
  const sum = (arr, sign) => arr.reduce((s, r) => s + (sign > 0 ? Math.max(0, r.oi_change) : Math.min(0, r.oi_change)), 0);
  const netCall = calls.reduce((s, r) => s + r.oi_change, 0);
  const netPut = puts.reduce((s, r) => s + r.oi_change, 0);
  const bullishStrikes = calls.filter((r) => r.bullish_accum);

  let headline;
  if (priceChange == null) {
    headline = "Price change between snapshots is unavailable.";
  } else if (bullishStrikes.length && netCall > 0) {
    const top = bullishStrikes.slice(0, 3).map((r) => `$${r.strike}`).join(", ");
    headline = `${today.ticker} rose ${priceChange >= 0 ? "+" : ""}${round(priceChange)} and call OI grew `
      + `${netCall.toLocaleString()} contracts — bullish accumulation at ${top}.`;
  } else if (netCall > 0 && !priceUp) {
    headline = `Call OI grew ${netCall.toLocaleString()} while price fell — likely call writing or hedging, not fresh longs.`;
  } else if (netCall < 0) {
    headline = `Call OI fell ${Math.abs(netCall).toLocaleString()} contracts — call positions are being unwound.`;
  } else {
    headline = `Little net change in call open interest day-over-day.`;
  }

  return {
    price_change: round(priceChange),
    price_change_pct: (priceChange != null && prior.spot)
      ? round((priceChange / prior.spot) * 100, 2) : null,
    summary: {
      call_oi_added: sum(calls, 1),
      call_oi_removed: sum(calls, -1),
      net_call_oi_change: netCall,
      net_put_oi_change: netPut,
      bullish_accum_strikes: bullishStrikes.length,
      headline,
    },
    calls,
    puts,
  };
}

router.post("/snapshot", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  if (!mongoReady()) return res.status(503).json({ error: "MongoDB unavailable — OI history needs the database." });
  try {
    const snap = await captureSnapshot(ticker, true);
    if (!snap) return res.status(200).json({
      ticker, available: false,
      error: `No option chain to snapshot for ${ticker}.`,
    });
    res.json({ ticker, date: snap.date, contracts: snap.contracts.length, spot: snap.spot });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  if (!mongoReady()) {
    return res.status(503).json({ error: "MongoDB unavailable — OI flow history needs the database." });
  }
  try {
    // Capture today (if not already) so a comparison is possible tomorrow.
    const today = await captureSnapshot(ticker, false);
    if (!today) {
      return res.json({ ticker, available: false, note: `No option chain to snapshot for ${ticker}.` });
    }

    // Most recent earlier snapshot.
    const prior = await OISnapshot.findOne({ ticker, date: { $lt: today.date } }).sort({ date: -1 });

    if (!prior) {
      return res.json({
        ticker,
        available: false,
        baseline: true,
        today_date: today.date,
        spot: round(today.spot),
        contracts_captured: today.contracts.length,
        note: `Baseline open interest captured for ${today.date}. Day-over-day OI `
            + `change will appear once a second trading day is recorded — open this `
            + `tab again next session (or schedule a daily snapshot).`,
      });
    }

    const diff = compare(today, prior);
    res.json({
      ticker,
      available: true,
      today_date: today.date,
      prior_date: prior.date,
      spot_today: round(today.spot),
      spot_prior: round(prior.spot),
      ...diff,
      note: "Day-over-day change between the two most recent daily snapshots. Open "
          + "interest updates once per day. Most meaningful when the chain is the "
          + "same expiration on both days (a weekly that hasn't rolled); on a pure "
          + "0DTE feed each day is a different expiration, so read cross-day strike "
          + "comparisons as positioning context. History accrues going forward and "
          + "cannot be backfilled.",
    });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

export default router;
