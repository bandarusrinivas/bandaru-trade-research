// /api/premarket?symbols=...
//
// UNUSUAL-VOLUME SCANNER for finding option-trade candidates. Scans a curated
// list of liquid, heavily-optioned large-caps and ranks them by a combination
// of (a) the gap vs the prior close and (b) relative volume.
//
// Relative volume is measured TIME-OF-DAY-AWARE where possible: today's
// cumulative volume is compared to the average cumulative volume at the same
// clock time over the prior sessions (from 15-minute bars). Before the regular
// session has intraday bars, it falls back to day-volume vs the 20-day average
// daily volume. The basis used is reported per row so nothing is hidden.
//
// Honest limit: the free/Schwab feeds don't give a true pre-market volume
// baseline, so genuine pre-market RVOL can't be computed exactly — the gap is
// the most reliable pre-open signal and is weighted accordingly.

import { Router } from "express";
import * as data from "../services/data.js";

const router = Router();

// ~40 liquid, optionable large-caps.
const DEFAULT_UNIVERSE = [
  "SPY", "QQQ", "IWM", "NVDA", "TSLA", "AAPL", "AMD", "META", "AMZN", "MSFT",
  "GOOGL", "NFLX", "AVGO", "COIN", "MSTR", "PLTR", "BABA", "MU", "SMCI", "INTC",
  "JPM", "BAC", "GS", "XOM", "DIS", "BA", "UBER", "SHOP", "SNOW", "CRM",
  "ORCL", "ADBE", "QCOM", "MARA", "SOFI", "F", "GLD", "DAL", "WMT", "C",
];

const CONCURRENCY = Math.max(1, parseInt(process.env.SCREENER_CONCURRENCY || "5", 10));
const round = (n, d = 2) =>
  (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  const lanes = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) lanes.push(lane());
  await Promise.all(lanes);
  return results;
}

function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((res) => setTimeout(() => res(null), ms)),
  ]);
}

// Date + minute-of-day for a timestamp, in US/Eastern.
function etParts(ts) {
  const s = new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const m = s.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);
  if (!m) return null;
  let hr = parseInt(m[4], 10);
  if (hr === 24) hr = 0;
  return { date: `${m[3]}-${m[1]}-${m[2]}`, tod: hr * 60 + parseInt(m[5], 10) };
}

// Time-of-day-aware relative volume from 15-minute bars.
function todRelVolume(bars) {
  if (!Array.isArray(bars) || bars.length < 10) return null;
  const byDate = new Map();
  for (const b of bars) {
    const p = etParts(b.t);
    if (!p) continue;
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push({ tod: p.tod, v: b.v || 0 });
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length < 2) return null;
  const today = dates[dates.length - 1];
  const todayBars = byDate.get(today);
  if (!todayBars.length) return null;
  const lastTod = Math.max(...todayBars.map((x) => x.tod));
  const todayCum = todayBars.reduce((s, x) => s + x.v, 0);
  const priorCums = [];
  for (const d of dates.slice(0, -1).slice(-4)) {
    const cum = byDate.get(d)
      .filter((x) => x.tod <= lastTod)
      .reduce((s, x) => s + x.v, 0);
    if (cum > 0) priorCums.push(cum);
  }
  if (!priorCums.length) return null;
  const baseline = priorCums.reduce((a, b) => a + b, 0) / priorCums.length;
  return baseline > 0 ? todayCum / baseline : null;
}

async function scanOne(sym) {
  try {
    const [quote, daily] = await Promise.all([
      data.getQuote(sym),
      data.getDailyBars(sym, "3mo"),
    ]);
    const price = quote?.price;
    if (!price || !daily?.volumes?.length) {
      return { ticker: sym, error: "no data" };
    }
    const vols = daily.volumes;
    const N = vols.length;
    // 20-day average of completed sessions (exclude today's partial bar).
    const completed = vols.slice(0, N - 1).slice(-20).filter((v) => v > 0);
    const avgVol = completed.length
      ? completed.reduce((a, b) => a + b, 0) / completed.length
      : null;
    const dayVol = quote.day_volume || vols[N - 1] || 0;

    // Time-of-day RVOL (optional, best-effort).
    const intraday = await withTimeout(data.getIntradayBars(sym, "15m", "5d"), 7000);
    const rvolTod = todRelVolume(intraday);
    const rvol = rvolTod != null ? rvolTod
               : (avgVol ? dayVol / avgVol : null);
    const rvolBasis = rvolTod != null ? "time-of-day" : "vs 20-day ADV";

    const gap = quote.change_pct ?? 0;
    const dayRangePct = (quote.day_high && quote.day_low && price)
      ? ((quote.day_high - quote.day_low) / price) * 100 : null;

    // Composite unusual score — gap and relative volume both matter.
    const score = Math.abs(gap) * 1.0 + (rvol != null ? Math.min(rvol, 8) * 1.5 : 0);
    const unusual = (rvol != null && rvol >= 2) || Math.abs(gap) >= 3;
    const bias = gap >= 1 ? "calls" : gap <= -1 ? "puts" : "neutral";

    return {
      ticker: sym,
      price: round(price),
      gap_pct: round(gap, 2),
      session: quote.session || "unknown",
      day_volume: dayVol,
      avg_volume: avgVol ? Math.round(avgVol) : null,
      rvol: round(rvol, 2),
      rvol_basis: rvolBasis,
      day_range_pct: round(dayRangePct, 2),
      atm_strike: Math.round(price),
      bias,
      unusual,
      score: round(score, 2),
    };
  } catch (e) {
    return { ticker: sym, error: e.message };
  }
}

router.get("/", async (req, res) => {
  const raw = (req.query.symbols || "").toString().trim();
  const symbols = raw
    ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 60)
    : DEFAULT_UNIVERSE;
  const start = Date.now();

  try {
    const rows = await runPool(symbols, scanOne, CONCURRENCY);
    const ok = rows.filter((r) => !r.error);
    ok.sort((a, b) => (b.score || 0) - (a.score || 0));

    const unusual = ok.filter((r) => r.unusual);
    const sessions = [...new Set(ok.map((r) => r.session))];
    res.json({
      results: ok,
      errors: rows.filter((r) => r.error),
      count: ok.length,
      unusual_count: unusual.length,
      session: sessions.length === 1 ? sessions[0] : "mixed",
      top_pick: ok[0] || null,
      elapsed_ms: Date.now() - start,
      note: "Ranked by gap and relative volume. RVOL basis is per-row: 'time-of-day' "
          + "compares today's cumulative volume to the same clock time on prior "
          + "sessions; 'vs 20-day ADV' is the fallback before intraday bars exist. "
          + "Educational scan — not a trade recommendation.",
    });
  } catch (e) {
    res.status(200).json({ results: [], errors: [], count: 0, error: e?.message || String(e) });
  }
});

export default router;
