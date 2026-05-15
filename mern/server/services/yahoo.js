// Yahoo Finance adapter — uses yahoo-finance2 (MIT-licensed npm package).
// Equivalent to src/clients/yahoo_client.py.

import yahooFinance from "yahoo-finance2";

// Silence the library's notice messages in container logs (best-effort — API varies by version)
if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);
}

export async function getQuote(symbol) {
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
}

export async function getDailyBars(symbol, period = "6mo") {
  // period: 1mo, 3mo, 6mo, 1y, etc. — converted to from/to dates
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
}

export async function getIntradayBars(symbol, interval = "5m", period = "1d") {
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
}

export async function getPreviousDay(symbol) {
  const bars = await getDailyBars(symbol, "1mo");
  // Most recent fully-closed daily bar before today (UTC date comparison)
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
  // Fallback: last bar
  const idx = bars.timestamps.length - 1;
  return {
    high: bars.highs[idx],
    low: bars.lows[idx],
    close: bars.closes[idx],
    open: bars.opens[idx],
    volume: bars.volumes[idx],
    timestamp: bars.timestamps[idx],
  };
}

export async function getOptionChain(symbol) {
  try {
    const opts = await yahooFinance.options(symbol);
    // First expiration's calls + puts
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
