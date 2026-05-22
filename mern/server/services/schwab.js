// Schwab adapter — HTTP client for the Python sidecar (legacy-python/data_api.py).
//
// The sidecar runs in its own container (service name "schwab") on port 5050
// and exposes /data/* endpoints in the same shapes as yahoo.js. This module
// just proxies HTTP and threads the same in-memory TTL cache that yahoo.js
// uses, so the dashboard's polling pattern doesn't hammer the sidecar.

import axios from "axios";

const BASE = process.env.SCHWAB_SIDECAR_URL || "http://schwab:5050";

const http = axios.create({
  baseURL: BASE,
  timeout: 20000,
});

// ----- Cache (mirrors yahoo.js so behavior is consistent) -----
const CACHE = new Map();
const INFLIGHT = new Map();

const TTL = {
  quote:    Number(process.env.SCHWAB_CACHE_QUOTE_MS    || 3_000),     // 3s — Schwab is real-time
  intraday: Number(process.env.SCHWAB_CACHE_INTRADAY_MS || 10_000),    // 10s
  daily:    Number(process.env.SCHWAB_CACHE_DAILY_MS    || 300_000),   // 5min
  prevDay:  Number(process.env.SCHWAB_CACHE_PREVDAY_MS  || 600_000),   // 10min
  chain:    Number(process.env.SCHWAB_CACHE_CHAIN_MS    || 15_000),    // 15s
};

async function memo(key, ttl, fn) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);

  const promise = (async () => {
    try {
      const value = await fn();
      CACHE.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}

async function call(endpoint, params) {
  try {
    const { data } = await http.get(endpoint, { params });
    return data;
  } catch (e) {
    // Sidecar returns {error, raw, http_status, http_body, http_url} on 4xx/5xx.
    // Preserve ALL of that so /api/diagnose can show the actual Schwab response.
    const body = e.response?.data || {};
    const msg = body.error
      || (e.response?.status === 503
            ? "Schwab token invalid/expired — re-run auth-schwab.command"
            : null)
      || e.message
      || "Schwab sidecar unreachable";
    const err = new Error(msg);
    err.status = e.response?.status || 502;
    err.detail = {
      raw_message:    body.raw,
      schwab_status:  body.http_status,
      schwab_body:    body.http_body,
      schwab_url:     body.http_url,
      sidecar_status: e.response?.status,
      endpoint,
      params,
    };
    throw err;
  }
}

// ----- Public interface (identical to yahoo.js) -----

export async function getQuote(symbol) {
  return memo(`schwab:quote:${symbol}`, TTL.quote,
    () => call("/data/quote", { ticker: symbol }));
}

export async function getDailyBars(symbol, period = "6mo") {
  return memo(`schwab:daily:${symbol}:${period}`, TTL.daily,
    () => call("/data/daily", { ticker: symbol, period }));
}

export async function getIntradayBars(symbol, interval = "5m", period = "1d") {
  return memo(`schwab:intraday:${symbol}:${interval}:${period}`, TTL.intraday,
    () => call("/data/intraday", { ticker: symbol, interval, period }));
}

export async function getPreviousDay(symbol) {
  return memo(`schwab:prevday:${symbol}`, TTL.prevDay,
    () => call("/data/prevday", { ticker: symbol }));
}

export async function getOptionChain(symbol) {
  return memo(`schwab:chain:${symbol}`, TTL.chain,
    () => call("/data/chain", { ticker: symbol }));
}

// Health probe so the route layer can fall back to Yahoo if Schwab is down.
export async function ping() {
  try {
    const { data } = await http.get("/health", { timeout: 2000 });
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
