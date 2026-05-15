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
// every call falls back to Yahoo automatically and the response body is
// tagged with {fallback: "yahoo", reason: "..."} so the UI / logs can show it.

import * as yahoo from "./yahoo.js";
import * as schwab from "./schwab.js";

const SOURCE = (process.env.DATA_SOURCE || "yahoo").toLowerCase();
const ALLOW_FALLBACK = (process.env.SCHWAB_FALLBACK_TO_YAHOO || "true").toLowerCase() !== "false";

let _lastFallbackReason = null;

function primary() {
  return SOURCE === "schwab" ? schwab : yahoo;
}

async function withFallback(name, ...args) {
  if (SOURCE !== "schwab") return yahoo[name](...args);
  try {
    const result = await schwab[name](...args);
    _lastFallbackReason = null;
    return result;
  } catch (e) {
    if (!ALLOW_FALLBACK) throw e;
    _lastFallbackReason = e.message || String(e);
    console.warn(`[data] Schwab ${name} failed (${_lastFallbackReason}); falling back to Yahoo`);
    return yahoo[name](...args);
  }
}

// Public interface — identical to yahoo.js / schwab.js
export const getQuote         = (sym)            => withFallback("getQuote", sym);
export const getDailyBars     = (sym, p)         => withFallback("getDailyBars", sym, p);
export const getIntradayBars  = (sym, iv, p)     => withFallback("getIntradayBars", sym, iv, p);
export const getPreviousDay   = (sym)            => withFallback("getPreviousDay", sym);
export const getOptionChain   = (sym)            => withFallback("getOptionChain", sym);

// Diagnostic
export function status() {
  return {
    configured_source: SOURCE,
    active_source: _lastFallbackReason ? "yahoo" : SOURCE,
    fallback_to_yahoo_enabled: ALLOW_FALLBACK,
    last_fallback_reason: _lastFallbackReason,
  };
}

export { schwab, yahoo };
