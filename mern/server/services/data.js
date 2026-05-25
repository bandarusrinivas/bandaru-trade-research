// Data-source dispatcher — picks the right adapter based on DATA_SOURCE.
//
// Both adapters expose the SAME interface: getQuote, getDailyBars,
// getIntradayBars, getPreviousDay, getOptionChain. Routes import from
// here so they never need to know which backend is in use.
//
//   DATA_SOURCE=yahoo  (default) → services/yahoo.js (free, ~15-min delayed)
//   DATA_SOURCE=schwab           → services/schwab.js (real-time, needs token)
//
// If Schwab is selected but the sidecar is unreachable / token is dead,
// every call falls back to Yahoo automatically so the dashboard always
// shows data instead of an empty page.
//
// CIRCUIT BREAKER — why it exists:
// When the Schwab token is dead, EVERY data call would otherwise attempt
// Schwab first, fail, and only then fall back to Yahoo. With the dashboard
// polling ~5 endpoints every 10s that adds a failed round-trip to every
// request and the page can look empty / stuck. After a couple of
// consecutive failures the breaker "opens": Schwab is skipped entirely for
// a cooldown window and calls go straight to Yahoo (fast). One probe call
// is allowed through after the cooldown to detect recovery.

import * as yahoo from "./yahoo.js";
import * as schwab from "./schwab.js";

const SOURCE = (process.env.DATA_SOURCE || "yahoo").toLowerCase();
const ALLOW_FALLBACK = (process.env.SCHWAB_FALLBACK_TO_YAHOO || "true").toLowerCase() !== "false";

// ── Circuit-breaker state ──
const CB = {
  fails: 0,                                                    // consecutive Schwab failures
  threshold: Number(process.env.SCHWAB_BREAKER_FAILS || 2),    // open after this many
  cooldownMs: Number(process.env.SCHWAB_BREAKER_COOLDOWN_MS || 90_000), // skip-Schwab window
  openUntil: 0,                                                // epoch ms; while now < this, skip Schwab
};

let _lastFallbackReason = null;

function circuitOpen() {
  return Date.now() < CB.openUntil;
}

function noteSchwabOk() {
  CB.fails = 0;
  CB.openUntil = 0;
  if (_lastFallbackReason !== null) {
    console.log("[data] Schwab recovered — back on real-time data");
  }
  _lastFallbackReason = null;
}

function noteSchwabFail(name, arg, reason) {
  CB.fails += 1;
  _lastFallbackReason = reason;
  if (CB.fails >= CB.threshold && !circuitOpen()) {
    CB.openUntil = Date.now() + CB.cooldownMs;
    console.error(
      `[data] ✗ Schwab failed ${CB.fails}× — pausing Schwab for `
      + `${Math.round(CB.cooldownMs / 1000)}s, serving delayed Yahoo data.`,
    );
  }
  console.error(
    `[data] ✗ Schwab ${name}(${arg || ""}) FAILED: ${reason}`
    + (ALLOW_FALLBACK ? "  → falling back to Yahoo" : "  (fallback disabled)"),
  );
}

async function withFallback(name, ...args) {
  if (SOURCE !== "schwab") return yahoo[name](...args);

  // Breaker open → don't even try Schwab, go straight to delayed Yahoo.
  if (circuitOpen()) {
    if (!ALLOW_FALLBACK) throw new Error(_lastFallbackReason || "Schwab unavailable");
    return yahoo[name](...args);
  }

  try {
    const result = await schwab[name](...args);
    noteSchwabOk();
    return result;
  } catch (e) {
    noteSchwabFail(name, args[0], e.message || String(e));
    if (!ALLOW_FALLBACK) throw e;
    return yahoo[name](...args);
  }
}

// Public interface — identical to yahoo.js / schwab.js
export const getQuote         = (sym)            => withFallback("getQuote", sym);
export const getDailyBars     = (sym, p)         => withFallback("getDailyBars", sym, p);
export const getIntradayBars  = (sym, iv, p)     => withFallback("getIntradayBars", sym, iv, p);
export const getPreviousDay   = (sym)            => withFallback("getPreviousDay", sym);
export const getOptionChain   = (sym)            => withFallback("getOptionChain", sym);

// Diagnostic / UI status.
//   delayed === true  → quotes are ~15-min-delayed Yahoo data and the UI
//                       should show the delayed-data caution banner.
export function status() {
  const onYahoo =
    SOURCE !== "schwab" || circuitOpen() || _lastFallbackReason != null;
  return {
    configured_source: SOURCE,
    active_source: onYahoo ? "yahoo" : "schwab",
    delayed: onYahoo,
    fallback_to_yahoo_enabled: ALLOW_FALLBACK,
    last_fallback_reason: _lastFallbackReason,
    schwab_circuit_open: circuitOpen(),
    schwab_consecutive_fails: CB.fails,
  };
}

export { schwab, yahoo };
