// /api/alerts — breaking-news alert detector.
//
// Scans Google News for HIGH-IMPACT, market-moving headlines — Federal Reserve
// / FOMC actions, Presidential / White House economic announcements, and
// general market-breaking news — from the last 24 hours. The dashboard polls
// this endpoint; when a headline appears that it hasn't seen before, it raises
// an in-app banner and (with permission) a desktop notification.
//
// This is a headline-detection heuristic, not an official wire feed — it
// surfaces what mainstream outlets are publishing, filtered to high-impact
// keywords. Always confirm market-moving events against a primary source.

import { Router } from "express";
import { fetchGoogleNews } from "./news.js";

const router = Router();

// Targeted searches, each tagged with the category it feeds.
const ALERT_QUERIES = [
  { q: "Federal Reserve interest rate decision", category: "fed" },
  { q: "FOMC Jerome Powell statement", category: "fed" },
  { q: "President executive order economy", category: "president" },
  { q: "White House tariff announcement", category: "president" },
  { q: "stock market breaking news", category: "market" },
];

// A headline only becomes an alert if its title hits one of these.
const HI_IMPACT = /\b(fed|federal reserve|fomc|powell|rate cut|rate hike|interest rate|rate decision|president|white house|executive order|tariff|trade war|breaking|emergency|recession|jobs report|cpi|inflation|jackson hole|shutdown)\b/i;

// Stable id from a title so the client can tell new alerts from seen ones.
function alertId(title) {
  const s = String(title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "a" + (h >>> 0).toString(36);
}

const cache = { data: null, exp: 0 };
const TTL = 2 * 60 * 1000;

router.get("/", async (req, res) => {
  if (cache.data && cache.exp > Date.now()) {
    return res.json({ ...cache.data, cached: true });
  }
  try {
    const batches = await Promise.all(
      ALERT_QUERIES.map(async ({ q, category }) => {
        const items = await fetchGoogleNews(q, 6);
        return items.map((n) => ({ ...n, category }));
      }),
    );

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const seen = new Set();
    const alerts = [];
    for (const it of batches.flat()) {
      if (!it.title || !HI_IMPACT.test(it.title)) continue;
      const ts = it.published ? Date.parse(it.published) : 0;
      if (ts && ts < cutoff) continue;            // last 24h only
      const id = alertId(it.title);
      if (seen.has(id)) continue;
      seen.add(id);
      alerts.push({
        id,
        title: it.title,
        url: it.url,
        category: it.category,
        source: it.source,
        publisher: it.publisher,
        published: it.published,
      });
    }
    alerts.sort((a, b) =>
      (b.published ? Date.parse(b.published) : 0) - (a.published ? Date.parse(a.published) : 0));

    const data = {
      generated_at: new Date().toISOString(),
      count: alerts.length,
      alerts: alerts.slice(0, 20),
      note: "High-impact Fed / President / market headlines from Google News, "
          + "last 24h. A headline-detection heuristic — confirm market-moving "
          + "events against a primary source.",
    };
    cache.data = data;
    cache.exp = Date.now() + TTL;
    res.json({ ...data, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
