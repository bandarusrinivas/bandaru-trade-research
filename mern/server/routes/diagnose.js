// /api/diagnose — exercises each data adapter independently and reports
// pass/fail per source. Use when the dashboard says "no data" and you need
// to know which layer is breaking. Set ?ticker=SPY (default).
//
//   curl http://localhost:4000/api/diagnose?ticker=SPY | python3 -m json.tool
//
// The response shape:
//   {
//     "configured_source": "schwab",
//     "fallback_enabled": true,
//     "ticker": "SPY",
//     "schwab": {
//       "available":  true,
//       "sidecar":    {ok: true, token_exists: true, ...},
//       "quote":      {ok: true, ms: 142, value: {...}}  // or {ok:false,error:"..."}
//       "intraday":   {ok: true, ms: 215, bars: 78},
//       "chain":      {ok: true, ms: 480, contracts: 124}
//     },
//     "yahoo":  { same shape },
//     "recommendation": "Use Schwab — all probes pass" | "Token expired — re-run auth-schwab" | ...
//   }

import { Router } from "express";
import { status as dataStatus, schwab, yahoo } from "../services/data.js";

const router = Router();

async function probe(name, fn) {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - start, value };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - start,
      error: e.message || String(e),
      status: e.status,
      detail: e.detail,   // ← new: full sidecar/Schwab error context
    };
  }
}

function summarize(probe) {
  if (!probe.value) return probe;
  // Summarize big payloads so the response stays readable
  const v = probe.value;
  if (Array.isArray(v)) return { ...probe, value: undefined, bars: v.length };
  if (Array.isArray(v?.contracts)) return { ...probe, value: undefined, contracts: v.contracts.length, underlying_price: v.underlying_price };
  if (Array.isArray(v?.closes)) return { ...probe, value: undefined, daily_bars: v.closes.length };
  if (typeof v?.price === "number") return { ...probe, value: { price: v.price, change: v.change, session: v.session } };
  return probe;
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const ds = dataStatus();

  // Schwab health
  const schwabResult = {};
  schwabResult.sidecar = await schwab.ping();
  if (schwabResult.sidecar.ok) {
    const [q, intra, ch] = await Promise.all([
      probe("quote",    () => schwab.getQuote(ticker)),
      probe("intraday", () => schwab.getIntradayBars(ticker, "5m", "1d")),
      probe("chain",    () => schwab.getOptionChain(ticker)),
    ]);
    schwabResult.quote    = summarize(q);
    schwabResult.intraday = summarize(intra);
    schwabResult.chain    = summarize(ch);
    schwabResult.available = q.ok || intra.ok || ch.ok;
  } else {
    schwabResult.available = false;
  }

  // Yahoo health (best-effort — may be rate-limited)
  const [yq, yintra, ychain] = await Promise.all([
    probe("quote",    () => yahoo.getQuote(ticker)),
    probe("intraday", () => yahoo.getIntradayBars(ticker, "5m", "1d")),
    probe("chain",    () => yahoo.getOptionChain(ticker)),
  ]);
  const yahooResult = {
    available: yq.ok || yintra.ok || ychain.ok,
    quote:    summarize(yq),
    intraday: summarize(yintra),
    chain:    summarize(ychain),
  };

  // Recommendation
  let recommendation;
  if (ds.configured_source === "schwab") {
    if (schwabResult.available) {
      recommendation = "Schwab is configured and working — dashboard should show real-time data.";
    } else if (!schwabResult.sidecar?.ok) {
      recommendation = "Schwab sidecar is unreachable — make sure you launched with menu option 2 (or restart-schwab.command).";
    } else if (!schwabResult.sidecar?.token_exists) {
      recommendation = "Sidecar can't see the token file — volume mount problem. Re-run restart-schwab.command.";
    } else {
      // Look at the actual Schwab HTTP body for a precise diagnosis
      const detail = schwabResult.quote?.detail || schwabResult.intraday?.detail || {};
      const ss = detail.schwab_status;
      const body = JSON.stringify(detail.schwab_body || "").toLowerCase();
      const reason = schwabResult.quote?.error || "unknown";

      if (ss === 401 && /refresh|invalid.?grant|expir/.test(body)) {
        recommendation = "Refresh token expired. Run auth-schwab.command to do a fresh OAuth.";
      } else if (ss === 401 || ss === 403) {
        if (/review|approv|not.?ready/.test(body)) {
          recommendation = "Your Schwab dev app isn't approved for production. Log in to https://developer.schwab.com/dashboard/apps and check the status.";
        } else if (/scope|permission|market.?data/.test(body)) {
          recommendation = "Schwab dev app is missing the Market Data Production scope. Edit it on developer.schwab.com.";
        } else {
          recommendation = `Schwab returned ${ss}: ${detail.schwab_body || reason}. Either token is dead or the dev app has limited access.`;
        }
      } else if (ss === 429) {
        recommendation = "Schwab is rate-limiting your account. Wait 60s and retry.";
      } else if (/token|expire|unauthor/i.test(reason)) {
        recommendation = "Schwab token rejected. Run auth-schwab.command.";
      } else {
        recommendation = `Schwab failing: ${reason}. Run 'docker compose logs schwab' for the traceback.`;
      }
    }
  } else {
    if (yahooResult.available) {
      recommendation = "Running on Yahoo (free, ~15-min delayed). To get Schwab real-time data, relaunch with menu option 2.";
    } else {
      recommendation = "Yahoo is being rate-limited and Schwab isn't configured. Wait 60s or switch to Schwab (menu option 2).";
    }
  }

  res.json({
    configured_source: ds.configured_source,
    active_source: ds.active_source,
    fallback_enabled: ds.fallback_to_yahoo_enabled,
    last_fallback_reason: ds.last_fallback_reason,
    ticker,
    schwab: schwabResult,
    yahoo: yahooResult,
    recommendation,
  });
});

export default router;
