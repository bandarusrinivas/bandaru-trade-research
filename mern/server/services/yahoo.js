// Yahoo Finance adapter — uses yahoo-finance2 (MIT-licensed npm package).
// Equivalent to src/clients/yahoo_client.py.

import yahooFinance from "yahoo-finance2";

// Silence the library's notice messages in container logs (best-effort — API varies by version)
if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);
}

// ---------------------------------------------------------------------------
// In-memory TTL cache + retry/backoff
// ---------------------------------------------------------------------------
// Why: Yahoo Finance throttles aggressively. The dashboard polls 4–5 endpoints
// every 10s; without caching, every poll triggers a fresh Yahoo call and the
// IP is rate-limited within seconds. The cache collapses bursts to one request
// per (endpoint, ticker) per TTL window. Retry-on-429 then handles transient
// throttles by waiting and retrying once.

const CACHE = new Map();           // key -> { value, expiresAt }
const INFLIGHT = new Map();        // key -> Promise (dedup concurrent callers)

const TTL = {
  quote:       Number(process.env.YAHOO_CACHE_QUOTE_MS || 5_000),     // 5s
  intraday:    Number(process.env.YAHOO_CACHE_INTRADAY_MS || 15_000), // 15s
  daily:       Number(process.env.YAHOO_CACHE_DAILY_MS || 300_000),   // 5min
  prevDay:     Number(process.env.YAHOO_CACHE_PREVDAY_MS || 600_000), // 10min
  chain:       Number(process.env.YAHOO_CACHE_CHAIN_MS || 30_000),    // 30s
};

function isRateLimited(err) {
  const msg = String(err?.message || err || "");
  return /Too Many Requests|429|Unexpected token 'T'/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cache + dedup + retry wrapper.
 *   key   – cache key
 *   ttl   – cache lifetime in ms
 *   fn    – async function returning the value to cache
 */
async function memo(key, ttl, fn) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  // De-dup concurrent callers waiting on the same key
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);

  const promise = (async () => {
    try {
      let value;
      try {
        value = await fn();
      } catch (e) {
        if (isRateLimited(e)) {
          // Single retry after a short jittered backoff
          await sleep(800 + Math.random() * 600);
          value = await fn();
        } else {
          throw e;
        }
      }
      CACHE.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

export async function getQuote(symbol) {
  return memo(`quote:${symbol}`, TTL.quote, async () => {
    try {
      const q = await yahooFinance.quote(symbol);
      return {
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        change_pct: q.regularMarketChangePercent,
        day_open: q.regularMarketOpen,
        day_high: q.regularMarketDayHigh,
        day_low: q.regularMarketDayLow,
        day_volume: q.regularMarketVolume,
        session: q.marketState === "REGULAR" ? "regular"
          : q.marketState === "PRE" ? "premarket"
          : q.marketState === "POST" ? "afterhours"
          : "closed",
      };
    } catch (e) {
      throw new Error(`Yahoo quote failed for ${symbol}: ${e.message}`);
    }
  });
}

export async function getDailyBars(symbol, period = "6mo") {
  return memo(`daily:${symbol}:${period}`, TTL.daily, async () => {
    const periodMap = {
      "1mo": 30, "3mo": 90, "6mo": 180,
      "1y": 365, "2y": 730, "5y": 1825,
    };
    const days = periodMap[period] || 180;
    const period1 = new Date(Date.now() - days * 86400000);
    const result = await yahooFinance.chart(symbol, {
      period1,
      interval: "1d",
    });
    if (!result?.quotes?.length) throw new Error(`No daily bars for ${symbol}`);
    const bars = result.quotes.filter((q) => q.close != null);
    return {
      highs: bars.map((b) => b.high),
      lows: bars.map((b) => b.low),
      closes: bars.map((b) => b.close),
      opens: bars.map((b) => b.open),
      volumes: bars.map((b) => b.volume),
      timestamps: bars.map((b) => b.date.getTime()),
    };
  });
}

export async function getIntradayBars(symbol, interval = "5m", period = "1d") {
  return memo(`intraday:${symbol}:${interval}:${period}`, TTL.intraday, async () => {
    const periodMap = { "1d": 1, "2d": 2, "5d": 5 };
    const days = periodMap[period] || 1;
    const period1 = new Date(Date.now() - days * 86400000);
    const result = await yahooFinance.chart(symbol, {
      period1,
      interval,
    });
    if (!result?.quotes?.length) return [];
    return result.quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        t: q.date.getTime(),
        o: q.open, h: q.high, l: q.low, c: q.close,
        v: q.volume || 0,
      }));
  });
}

export async function getPreviousDay(symbol) {
  return memo(`prevday:${symbol}`, TTL.prevDay, async () => {
    const bars = await getDailyBars(symbol, "1mo");
    const todayDate = new Date().toDateString();
    for (let i = bars.timestamps.length - 1; i >= 0; i--) {
      if (new Date(bars.timestamps[i]).toDateString() !== todayDate) {
        return {
          high: bars.highs[i],
          low: bars.lows[i],
          close: bars.closes[i],
          open: bars.opens[i],
          volume: bars.volumes[i],
          timestamp: bars.timestamps[i],
        };
      }
    }
    const idx = bars.timestamps.length - 1;
    return {
      high: bars.highs[idx],
      low: bars.lows[idx],
      close: bars.closes[idx],
      open: bars.opens[idx],
      volume: bars.volumes[idx],
      timestamp: bars.timestamps[idx],
    };
  });
}

export async function getOptionChain(symbol) {
  return memo(`chain:${symbol}`, TTL.chain, async () => {
    try {
      const opts = await yahooFinance.options(symbol);
      if (!opts?.options?.length) return { underlying_price: null, contracts: [] };
      const first = opts.options[0];
      const contracts = [];
      for (const c of first.calls || []) {
        contracts.push({ ...mapContract(c), type: "call" });
      }
      for (const p of first.puts || []) {
        contracts.push({ ...mapContract(p), type: "put" });
      }
      return {
        underlying_price: opts.underlyingSymbol ? opts.quote?.regularMarketPrice : null,
        contracts,
      };
    } catch (e) {
      return { underlying_price: null, contracts: [], error: e.message };
    }
  });
}

function mapContract(c) {
  return {
    ticker: c.contractSymbol,
    strike: c.strike,
    bid: c.bid || 0,
    ask: c.ask || 0,
    mid: c.bid && c.ask ? (c.bid + c.ask) / 2 : (c.lastPrice || 0),
    last: c.lastPrice || 0,
    volume: c.volume || 0,
    open_interest: c.openInterest || 0,
    iv: c.impliedVolatility ? c.impliedVolatility * 100 : null,
  };
}

// Diagnostic — peek at cache state from a route or test
export function _cacheStats() {
  const now = Date.now();
  return {
    entries: CACHE.size,
    inflight: INFLIGHT.size,
    keys: [...CACHE.entries()].map(([k, v]) => ({
      key: k,
      ttlRemainingMs: Math.max(0, v.expiresAt - now),
    })),
  };
}
