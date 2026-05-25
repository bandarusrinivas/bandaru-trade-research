// /api/news — aggregated market news feed.
//
// Three sections (see the News tab):
//   breaking      — macro / market-moving headlines (Google News RSS + Yahoo)
//   stock_feed    — multi-source stock news: Finnhub + Benzinga + Google News
//                   + Yahoo + MarketWatch RSS, deduped and recency-sorted
//   world_indexes — international stock-index quotes (FTSE, DAX, Nikkei, …)
//
// WHY NOT SCHWAB for headlines: the Schwab developer API has no news endpoint —
// it serves quotes, option chains, price history, movers and market hours only.
// Finnhub headlines need a free FINNHUB_API_KEY in .env (skipped if absent).

import { Router } from "express";
import axios from "axios";
import { searchNews } from "../services/yahoo.js";

const router = Router();

// Macro / breaking-news search terms for Google News.
const BREAKING_QUERIES = [
  "stock market today",
  "S&P 500",
  "Federal Reserve interest rates",
  "Wall Street stocks",
];

// Stock-focused Google News searches for the multi-source stock feed.
const STOCK_FEED_QUERIES = [
  "stocks to watch",
  "stock movers today",
  "earnings results stocks",
];

// International / global-market Google News searches for the world news feed.
const INTL_NEWS_QUERIES = [
  "European stock markets",
  "Asia Pacific stock markets",
  "global stock markets",
  "FTSE DAX Nikkei Hang Seng",
];

// International stock indexes — Yahoo caret symbols + friendly name + region.
const WORLD_INDEXES = [
  { sym: "^FTSE",     name: "FTSE 100",       region: "United Kingdom" },
  { sym: "^GDAXI",    name: "DAX",            region: "Germany" },
  { sym: "^FCHI",     name: "CAC 40",         region: "France" },
  { sym: "^STOXX50E", name: "Euro Stoxx 50",  region: "Eurozone" },
  { sym: "^IBEX",     name: "IBEX 35",        region: "Spain" },
  { sym: "^N225",     name: "Nikkei 225",     region: "Japan" },
  { sym: "^HSI",      name: "Hang Seng",      region: "Hong Kong" },
  { sym: "000001.SS", name: "Shanghai Comp.", region: "China" },
  { sym: "^AXJO",     name: "S&P/ASX 200",    region: "Australia" },
  { sym: "^KS11",     name: "KOSPI",          region: "South Korea" },
  { sym: "^BSESN",    name: "BSE Sensex",     region: "India" },
  { sym: "^GSPTSE",   name: "S&P/TSX",        region: "Canada" },
  { sym: "^BVSP",     name: "Bovespa",        region: "Brazil" },
  { sym: "^MXX",      name: "IPC Mexico",     region: "Mexico" },
];

// ── helpers ──
function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const normTitle = (t) =>
  String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 72);

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = normTitle(it.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function byRecency(a, b) {
  return (b.published ? Date.parse(b.published) : 0) - (a.published ? Date.parse(a.published) : 0);
}

// Best-effort wrapper — resolves null on error or after `ms`, never throws.
function bestEffort(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((r) => setTimeout(() => r(null), ms)),
  ]);
}

// Fetch + parse one Google News RSS search feed. Best-effort: never throws.
async function fetchGoogleNews(query, limit = 7) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`
            + `&hl=en-US&gl=US&ceid=US:en`;
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BandaruNews/1.0)" },
      responseType: "text",
    });
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(data)) && items.length < limit) {
      const block = m[1];
      const pick = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
        return r ? r[1] : null;
      };
      let title = decodeEntities(pick("title"));
      const link = decodeEntities(pick("link"));
      const pub = pick("pubDate");
      const source = decodeEntities(pick("source"));
      if (!title || !link) continue;
      // Google News appends " - Publisher" to titles — strip it.
      if (source && title.endsWith(` - ${source}`)) {
        title = title.slice(0, -(source.length + 3)).trim();
      }
      let published = null;
      if (pub) { const d = new Date(pub); if (!isNaN(d)) published = d.toISOString(); }
      items.push({
        title,
        url: link,
        publisher: source || "Google News",
        published,
        source: "Google News",
        tickers: [],
      });
    }
    return items;
  } catch {
    return [];
  }
}

// ── Generic RSS 2.0 <item> parser — used for the MarketWatch feeds ──
function parseRssItems(xml, source, fallbackPublisher, limit) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return r ? r[1] : null;
    };
    const title = decodeEntities(pick("title"));
    const link = decodeEntities(pick("link"));
    const pub = pick("pubDate");
    if (!title || !link) continue;
    let published = null;
    if (pub) { const d = new Date(pub); if (!isNaN(d)) published = d.toISOString(); }
    items.push({ title, url: link, publisher: fallbackPublisher, published, source, tickers: [] });
  }
  return items;
}

// ── MarketWatch RSS — feeds listed at marketwatch.com/site/rss. Both the
// Dow Jones content host and the classic feeds.marketwatch.com host are tried;
// whichever responds with valid RSS contributes (deduped by URL). Best-effort. ──
const MARKETWATCH_FEEDS = [
  "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
  "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
  "http://feeds.marketwatch.com/marketwatch/topstories/",
  "http://feeds.marketwatch.com/marketwatch/marketpulse/",
];

async function fetchMarketWatch(limit = 24) {
  const seen = new Set();
  const out = [];
  await Promise.all(MARKETWATCH_FEEDS.map(async (url) => {
    try {
      const { data } = await axios.get(url, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BandaruNews/1.0)" },
        responseType: "text",
      });
      for (const it of parseRssItems(data, "MarketWatch", "MarketWatch", 14)) {
        if (it.url && !seen.has(it.url)) { seen.add(it.url); out.push(it); }
      }
    } catch { /* best-effort — a dead feed just contributes nothing */ }
  }));
  return out.slice(0, limit);
}

// ── Benzinga RSS — public stock-market news feeds (no key needed). Several
// section feeds are merged (news, markets, trading ideas), deduped by URL.
// Best-effort: a dead feed simply contributes nothing. ──
const BENZINGA_FEEDS = [
  "https://www.benzinga.com/news/feed",
  "https://www.benzinga.com/markets/feed",
  "https://www.benzinga.com/trading-ideas/feed",
];

async function fetchBenzinga(limit = 24) {
  const seen = new Set();
  const out = [];
  await Promise.all(BENZINGA_FEEDS.map(async (url) => {
    try {
      const { data } = await axios.get(url, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BandaruNews/1.0)" },
        responseType: "text",
      });
      for (const it of parseRssItems(data, "Benzinga", "Benzinga", 14)) {
        if (it.url && !seen.has(it.url)) { seen.add(it.url); out.push(it); }
      }
    } catch { /* best-effort — a dead feed just contributes nothing */ }
  }));
  return out.slice(0, limit);
}

// ── Finnhub general market news — needs a free key in FINNHUB_API_KEY.
// Without a key this source is simply skipped; the feed still works on the
// Google News / Yahoo / MarketWatch sources. Key: https://finnhub.io/register ──
async function fetchFinnhub(limit = 30) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const { data } = await axios.get("https://finnhub.io/api/v1/news", {
      timeout: 8000,
      params: { category: "general", token: key },
    });
    if (!Array.isArray(data)) return [];
    return data
      .map((n) => ({
        title: decodeEntities(n.headline),
        url: n.url,
        publisher: n.source || "Finnhub",
        published: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
        source: "Finnhub",
        tickers: n.related
          ? String(n.related).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4)
          : [],
      }))
      .filter((n) => n.title && n.url)
      .slice(0, limit);
  } catch {
    return [];
  }
}

// Small bounded-concurrency map — keeps the index fetches gentle.
async function mapPool(items, fn, concurrency = 5) {
  const out = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return out;
}

// ── International stock-index quotes ──
// Fetched straight from Yahoo's v8 chart endpoint with plain axios. That
// endpoint needs no crumb/cookie, so it works where yahoo-finance2's quote()
// path is blocked — which is what left this section blank. Best-effort.
const round2 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);

async function fetchIndexChart(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`
            + `?range=5d&interval=1d`;
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BandaruNews/1.0)" },
    });
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const last = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const change = prev != null ? last - prev : null;
    return { last, change, change_pct: prev ? (change / prev) * 100 : null };
  } catch {
    return null;
  }
}

async function fetchWorldIndexes() {
  return mapPool(WORLD_INDEXES, async (idx) => {
    const q = await fetchIndexChart(idx.sym);
    return {
      symbol: idx.sym, name: idx.name, region: idx.region,
      last: round2(q?.last),
      change: round2(q?.change),
      change_pct: round2(q?.change_pct),
    };
  }, 5);
}

// ── 4-minute in-memory cache (news doesn't change second-to-second) ──
let cache = { data: null, exp: 0 };
const TTL = 4 * 60 * 1000;

router.get("/", async (req, res) => {
  if (cache.data && cache.exp > Date.now()) {
    return res.json({ ...cache.data, cached: true });
  }

  try {
    // ── 1. Breaking news — Google News macro searches + Yahoo market news ──
    const googleBatches = await Promise.all(
      BREAKING_QUERIES.map((q) => fetchGoogleNews(q, 7)),
    );
    const yahooMarket = await bestEffort(searchNews("stock market", 10), 8000);
    let breaking = dedupe([...googleBatches.flat(), ...(yahooMarket || [])]);
    breaking.sort(byRecency);
    breaking = breaking.slice(0, 24);

    // ── 2. Stock Market Feed — Finnhub + Benzinga + Google + Yahoo + MarketWatch ──
    const finnhubEnabled = !!process.env.FINNHUB_API_KEY;
    const [finnhubNews, mwNews, benzingaNews, stockGoogle, stockYahoo] = await Promise.all([
      bestEffort(fetchFinnhub(30), 9000),
      bestEffort(fetchMarketWatch(24), 9000),
      bestEffort(fetchBenzinga(24), 9000),
      bestEffort(
        Promise.all(STOCK_FEED_QUERIES.map((q) => fetchGoogleNews(q, 6)))
          .then((b) => b.flat()),
        9000,
      ),
      bestEffort(searchNews("stock market movers", 12), 8000),
    ]);
    let stockFeed = dedupe([
      ...(finnhubNews || []),
      ...(mwNews || []),
      ...(benzingaNews || []),
      ...(stockGoogle || []),
      ...(stockYahoo || []),
    ]);
    stockFeed.sort(byRecency);
    stockFeed = stockFeed.slice(0, 44);
    const stockSources = {
      finnhub: (finnhubNews || []).length,
      marketwatch: (mwNews || []).length,
      benzinga: (benzingaNews || []).length,
      google: (stockGoogle || []).length,
      yahoo: (stockYahoo || []).length,
    };

    // ── 3. International stock indexes + 4. International news ──
    const [worldIndexes, intlGoogle, intlYahoo] = await Promise.all([
      bestEffort(fetchWorldIndexes(), 20000).then((r) => r || []),
      bestEffort(
        Promise.all(INTL_NEWS_QUERIES.map((q) => fetchGoogleNews(q, 6)))
          .then((b) => b.flat()),
        9000,
      ),
      bestEffort(searchNews("world stock markets", 10), 8000),
    ]);
    let intlNews = dedupe([...(intlGoogle || []), ...(intlYahoo || [])]);
    intlNews.sort(byRecency);
    intlNews = intlNews.slice(0, 24);

    const data = {
      generated_at: new Date().toISOString(),
      counts: {
        breaking: breaking.length,
        stock_feed: stockFeed.length,
        world_indexes: worldIndexes.filter((w) => w.last != null).length,
        intl_news: intlNews.length,
      },
      breaking,
      stock_feed: stockFeed,
      stock_sources: stockSources,
      finnhub_enabled: finnhubEnabled,
      world_indexes: worldIndexes,
      intl_news: intlNews,
      note: "Breaking news via Google News RSS + Yahoo Finance. Stock Market "
          + "Feed merges Finnhub, Benzinga, Google News, Yahoo Finance and "
          + "MarketWatch RSS. International indexes are ~15-min-delayed levels from Yahoo "
          + "Finance (last close vs prior close). International news is global / "
          + "regional market headlines via Google News + Yahoo. Finnhub "
          + "headlines appear only when a free FINNHUB_API_KEY is set in .env.",
    };
    cache = { data, exp: Date.now() + TTL };
    res.json({ ...data, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
// Reused by the breaking-news alert route.
export { fetchGoogleNews };
