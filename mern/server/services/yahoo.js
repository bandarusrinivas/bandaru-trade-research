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

// Evict expired entries every 5 min so CACHE can't grow without bound across a
// long-running server process. Unref'd so it never holds the process open.
const _cacheSweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of CACHE) if (v.expiresAt <= now) CACHE.delete(k);
}, 5 * 60_000);
if (typeof _cacheSweep.unref === "function") _cacheSweep.unref();

// ---------------------------------------------------------------------------
// Index-symbol normalization
// ---------------------------------------------------------------------------
// The screener watchlist and ticker picker use plain index names (SPX, VIX,
// XSP). Yahoo serves indices under caret-prefixed tickers, so a raw "VIX"
// request 404s. Map the common ones onto Yahoo's symbols.
const YAHOO_SYMBOL_ALIASES = {
  SPX: "^GSPC",   // S&P 500 index
  XSP: "^XSP",    // Cboe Mini-SPX index
  VIX: "^VIX",    // Cboe Volatility Index
  NDX: "^NDX",    // Nasdaq-100
  RUT: "^RUT",    // Russell 2000
  DJI: "^DJI",    // Dow Jones Industrial Average
};
function ySym(symbol) {
  const s = String(symbol || "").toUpperCase().trim();
  return YAHOO_SYMBOL_ALIASES[s] || symbol;
}

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

// Global queue to space out requests for DIFFERENT symbols and prevent bursting
let _globalQueue = Promise.resolve();

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
      let retries = 0;
      const maxRetries = 3;
      
      while (true) {
        try {
          // Execute function in a serialized global queue to pace outgoing requests
          value = await new Promise((resolve, reject) => {
            const task = async () => {
              try {
                await sleep(250); // 250ms spacing between all Yahoo API calls globally
                const res = await fn();
                resolve(res);
              } catch (err) {
                reject(err);
              }
            };
            _globalQueue = _globalQueue.then(task).catch(() => {});
          });
          break; // Success, exit retry loop
        } catch (e) {
          if (isRateLimited(e) && retries < maxRetries) {
            retries++;
            const backoffMs = Math.pow(2, retries) * 1000 + Math.random() * 500;
            console.warn(`[Yahoo] Rate limited on ${key}. Retrying in ${Math.round(backoffMs)}ms (Attempt ${retries}/${maxRetries})`);
            await sleep(backoffMs);
          } else {
            throw e;
          }
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
      const q = await yahooFinance.quote(ySym(symbol));
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
    const result = await yahooFinance.chart(ySym(symbol), {
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
    const result = await yahooFinance.chart(ySym(symbol), {
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
    if (!bars || !bars.timestamps || bars.timestamps.length === 0) {
      throw new Error(`No daily bars available for ${symbol} to determine previous day`);
    }

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
      const opts = await yahooFinance.options(ySym(symbol));
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

// ---------------------------------------------------------------------------
// Profile — company info + analyst + earnings + news (always Yahoo, regardless
// of DATA_SOURCE, since Schwab doesn't expose news/analyst the same way).
// ---------------------------------------------------------------------------
export async function getProfile(symbol) {
  return memo(`profile:${symbol}`, 5 * 60_000, async () => {
    // Bundle of modules — one quoteSummary call returns most of what we need
    const modules = [
      "summaryProfile",            // company description, sector, industry
      "summaryDetail",             // PE, dividend, 52w range
      "defaultKeyStatistics",      // beta, EPS, shares outstanding
      "financialData",             // earnings growth, revenue, target prices
      "earnings",                  // quarterly EPS actual vs estimate
      "earningsHistory",           // last 4Q
      "earningsTrend",             // next-Q + next-year EPS estimates + 5y growth
      "recommendationTrend",       // analyst counts by month
      "upgradeDowngradeHistory",   // recent analyst rating changes
      "calendarEvents",            // next earnings date
      "price",                     // company name, exchange
      "incomeStatementHistory",    // annual revenue/profit
      "incomeStatementHistoryQuarterly",  // quarterly
    ];

    let summary = {};
    try {
      summary = await yahooFinance.quoteSummary(ySym(symbol), { modules });
    } catch (e) {
      // Some symbols (indices like ^VIX, ^SPX) don't have a full summary
      summary = {};
    }

    // News — separate endpoint
    let news = [];
    try {
      const sr = await yahooFinance.search(symbol, { quotesCount: 0, newsCount: 8 });
      news = (sr?.news || []).slice(0, 5).map((n) => ({
        title:     n.title,
        publisher: n.publisher,
        url:       n.link || n.url,
        published: n.providerPublishTime
                     ? new Date(n.providerPublishTime * 1000).toISOString()
                     : null,
      }));
    } catch { /* tolerate news failure */ }

    return { summary, news };
  });
}


// ---------------------------------------------------------------------------
// News search — powers the News tab. Yahoo returns per-symbol / per-topic news
// from one search call. Cached briefly so the aggregated feed stays fast.
// ---------------------------------------------------------------------------
export async function searchNews(query, count = 8) {
  return memo(`news:${query}:${count}`, 3 * 60_000, async () => {
    try {
      const sr = await yahooFinance.search(query, { quotesCount: 0, newsCount: count });
      return (sr?.news || [])
        .map((n) => ({
          title: n.title,
          url: n.link || n.url || null,
          publisher: n.publisher || "Yahoo Finance",
          published: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toISOString()
            : null,
          source: "Yahoo",
          tickers: Array.isArray(n.relatedTickers) ? n.relatedTickers : [],
        }))
        .filter((n) => n.title && n.url);
    } catch {
      return [];
    }
  });
}
