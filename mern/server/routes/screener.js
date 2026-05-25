// Stock screener — parallel scan + ToS-style multi-column output.
//
// Each row reports:
//   ticker, last, mark, net_chg, change_pct, open, high, low,
//   pivots {PP, R1, R2, S1, S2}, pivot_zone,
//   trend / rsi / adx / ttm_squeeze  (on the chosen PRIMARY timeframe),
//   mtf  — multi-timeframe agreement between the 15-minute and daily trend,
//   volume, volume_x_avg (RVol),
//   iv_atm — ATM implied volatility (from the option chain),
//   iv_hv  — ATM IV ÷ 20-day realized (historical) volatility.  This is an
//            honest "are options rich?" gauge.  It is NOT IV Rank — true IVR
//            needs 52 weeks of historical IV, which the free/Schwab feeds
//            don't provide.
//   gamma_wall / gamma_flag — heaviest call-OI strike above spot, a proxy for
//            a gamma-squeeze magnet (not a dealer-gamma model).
//   breakout, opportunity + why + score
import { Router } from "express";
import * as data from "../services/data.js";
import { adx, rsi, macd, ema, calculatePivots, ttmSqueeze } from "../services/indicators.js";

const router = Router();

// 38-symbol watchlist matching the ToS reference view
const DEFAULT_LIST = [
  "BITB", "COST", "WMT", "MSTR", "UVXY", "GBTC", "META", "GLD",
  "GOOGL", "MDB", "BIDU", "NFLX", "TQQQ", "SPY", "QQQ", "NVDA",
  "AVGO", "AMZN", "AAPL", "CSCO", "VGT", "JPM", "COIN", "ADBE",
  "EEM", "TSLA", "GS", "PLTR", "AMD", "BABA", "PG", "MSFT",
  "XOM", "SNOW", "CRM", "SPX", "XSP", "VIX",
];

const OPP_SCORES = {
  "SQUEEZE FIRED BULL": 90, "SQUEEZE FIRED BEAR": 90,
  "BULLISH BREAKOUT": 85, "BEARISH BREAKDOWN": 85,
  "EMA CROSS BULL": 70, "EMA CROSS BEAR": 70,
  "BULLISH BOUNCE": 65, "BEARISH REJECTION": 65,
  "BULLISH MOMENTUM": 50, "BEARISH MOMENTUM": 50,
  "SQUEEZE COILING": 40,
  "NO SIGNAL": 0,
};

// Classify where price sits relative to pivot levels (matches ToS "Pivots" col)
function pivotZone(price, p) {
  if (!p || !price) return "—";
  if (price > p.R2) return "ABOVE R2";
  if (price > p.R1) return "R1→R2";
  if (price > p.PP) return "PP→R1";
  if (price > p.S1) return "S1→PP";
  if (price > p.S2) return "S2→S1";
  return "BELOW S2";
}

function squeezeLabel(sq) {
  if (sq.fired === "bullish") return "FIRED BULL";
  if (sq.fired === "bearish") return "FIRED BEAR";
  if (sq.in_squeeze) return "ON";
  return "OFF";
}

function round(n, digits = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency pool. Firing every symbol at once gets the IP / Schwab
// sidecar rate-limited; scanning a handful at a time keeps the scan well under
// the client's timeout.
// ---------------------------------------------------------------------------
const CONCURRENCY = Math.max(1, parseInt(process.env.SCREENER_CONCURRENCY || "5", 10));

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

// Best-effort: resolve null on error OR after `ms`, never reject.
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((res) => setTimeout(() => res(null), ms)),
  ]);
}

// Intraday bars come back as [{t,o,h,l,c,v}] — normalize to the parallel-array
// shape getDailyBars uses so the indicators can run on either timeframe.
function intradayToArrays(bars) {
  return {
    highs:   bars.map((b) => b.h),
    lows:    bars.map((b) => b.l),
    closes:  bars.map((b) => b.c),
    opens:   bars.map((b) => b.o),
    volumes: bars.map((b) => b.v || 0),
  };
}

// Run the indicator bundle on one timeframe's bars.
function analyzeTF(bars) {
  const { highs, lows, closes } = bars || {};
  if (!closes || closes.length < 30) return null;
  const e8  = ema(closes, 8);
  const e21 = ema(closes, 21);
  const r   = rsi(closes, 14);
  const m   = macd(closes);
  const ad  = adx(highs, lows, closes, 14);
  const sq  = ttmSqueeze(highs, lows, closes);
  const last = closes[closes.length - 1];
  const e8n = e8[e8.length - 1], e21n = e21[e21.length - 1];
  let dir = "neutral";
  if (e8n != null && e21n != null) {
    if (last > e8n && e8n > e21n) dir = "bull";
    else if (last < e8n && e8n < e21n) dir = "bear";
  }
  return { e8, e21, rsi: r, macd: m, adx: ad, squeeze: sq, dir, last };
}

// Opportunity classifier — runs on the chosen primary timeframe.
function classify(tf, pivots, last, volX) {
  const sq = tf.squeeze, m = tf.macd, ad = tf.adx;
  let breakout = "NONE";
  if (pivots.R1 && last > pivots.R1 && (volX || 0) > 1.2) breakout = "BULL BREAK";
  else if (pivots.S1 && last < pivots.S1 && (volX || 0) > 1.2) breakout = "BEAR BREAK";

  let opp = "NO SIGNAL", why = "No active setup", direction = "neutral";
  const mom = (sq.momentum ?? 0).toFixed(2);
  if (sq.fired === "bullish") {
    opp = "SQUEEZE FIRED BULL"; why = `TTM squeeze released, mom ${mom}`; direction = "bull";
  } else if (sq.fired === "bearish") {
    opp = "SQUEEZE FIRED BEAR"; why = `TTM squeeze released, mom ${mom}`; direction = "bear";
  } else if (breakout === "BULL BREAK") {
    opp = "BULLISH BREAKOUT"; why = `Broke above R1 on ${volX.toFixed(1)}× volume`; direction = "bull";
  } else if (breakout === "BEAR BREAK") {
    opp = "BEARISH BREAKDOWN"; why = `Broke below S1 on ${volX.toFixed(1)}× volume`; direction = "bear";
  } else if (tf.e8.length >= 2 && tf.e21.length >= 2) {
    const e8n = tf.e8.at(-1), e8p = tf.e8.at(-2);
    const e21n = tf.e21.at(-1), e21p = tf.e21.at(-2);
    if (e8p && e8n && e21p && e21n) {
      if (e8p <= e21p && e8n > e21n) { opp = "EMA CROSS BULL"; why = "EMA 8 crossed above EMA 21"; direction = "bull"; }
      else if (e8p >= e21p && e8n < e21n) { opp = "EMA CROSS BEAR"; why = "EMA 8 crossed below EMA 21"; direction = "bear"; }
    }
  }
  if (opp === "NO SIGNAL" && ad.adx >= 25) {
    if (m.histogram > 0 && ad.trend === "Bullish") {
      opp = "BULLISH MOMENTUM"; why = `ADX ${ad.adx} · MACD hist +${m.histogram.toFixed(2)}`; direction = "bull";
    } else if (m.histogram < 0 && ad.trend === "Bearish") {
      opp = "BEARISH MOMENTUM"; why = `ADX ${ad.adx} · MACD hist ${m.histogram.toFixed(2)}`; direction = "bear";
    }
  }
  if (opp === "NO SIGNAL" && sq.in_squeeze) {
    opp = "SQUEEZE COILING"; why = "Volatility compressed — breakout pending"; direction = "neutral";
  }
  return { opp, why, direction, breakout };
}

// Multi-timeframe agreement between the 15-minute and daily trend.
function multiTimeframe(intraDir, dailyDir) {
  const g = (d) => (d === "bull" ? "▲" : d === "bear" ? "▼" : "–");
  if (!intraDir) return { mtf: `–  ${g(dailyDir)}`, mtf_dir: "neutral" };
  const mtf = `${g(intraDir)} ${g(dailyDir)}`;
  let mtf_dir;
  if (intraDir === "bull" && dailyDir === "bull") mtf_dir = "bull";
  else if (intraDir === "bear" && dailyDir === "bear") mtf_dir = "bear";
  else if (intraDir === dailyDir) mtf_dir = "neutral";
  else mtf_dir = "mixed";
  return { mtf, mtf_dir };
}

// Annualized realized (historical) volatility, % — stdev of daily log returns.
function realizedVol(closes, lookback = 20) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const slice = rets.slice(-lookback);
  if (slice.length < 5) return null;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// IV values arrive as % (Yahoo) or decimal (Schwab) — normalize to %.
const ivPct = (iv) => (iv == null || !isFinite(iv) ? null : iv > 1 ? iv : iv * 100);

// ATM implied volatility — average of the nearest call + nearest put IV.
function atmIV(contracts, spot) {
  if (!contracts?.length || !spot) return null;
  const near = (type) => contracts
    .filter((c) => c.type === type && c.strike && ivPct(c.iv) > 0)
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  const vals = [ivPct(near("call")?.iv), ivPct(near("put")?.iv)].filter((v) => v != null && v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Gamma-squeeze proxy — heaviest call open-interest strike above spot.
// This is an OI-magnet heuristic, NOT a dealer-gamma-exposure model.
function gammaProxy(contracts, spot) {
  const blank = { gamma_wall: null, gamma_flag: "", gamma_note: null, call_put_oi: null };
  if (!contracts?.length || !spot) return blank;
  const calls = contracts.filter((c) => c.type === "call" && c.strike && (c.open_interest || 0) > 0);
  const puts  = contracts.filter((c) => c.type === "put"  && c.strike && (c.open_interest || 0) > 0);
  if (!calls.length) return blank;
  const callOI = calls.reduce((s, c) => s + (c.open_interest || 0), 0);
  const putOI  = puts.reduce((s, c) => s + (c.open_interest || 0), 0);
  const above = calls.filter((c) => c.strike >= spot * 0.99 && c.strike <= spot * 1.12);
  if (!above.length) return { ...blank, call_put_oi: round(putOI ? callOI / putOI : null, 2) };
  const wall = above.reduce((m, c) => ((c.open_interest || 0) > (m.open_interest || 0) ? c : m), above[0]);
  const dist = (wall.strike - spot) / spot;
  const ratio = putOI > 0 ? callOI / putOI : (callOI > 0 ? 99 : 0);
  let gamma_flag = "", gamma_note = null;
  if (dist <= 0.04 && ratio >= 1.5) {
    gamma_flag = "RISK";
    gamma_note = `Price near a heavy call-OI wall at $${wall.strike} · ${ratio.toFixed(1)}× call/put OI`;
  } else if (dist <= 0.08 && ratio >= 1.2) {
    gamma_flag = "WATCH";
    gamma_note = `Call OI building at $${wall.strike} · ${ratio.toFixed(1)}× call/put OI`;
  }
  return { gamma_wall: wall.strike, gamma_flag, gamma_note, call_put_oi: round(ratio, 2) };
}

async function screenOne(sym, primaryTf) {
  try {
    // Daily bars — drive the price block, pivots, daily trend, and realized vol.
    const daily = await data.getDailyBars(sym, "6mo");
    if (!daily.closes || daily.closes.length < 30) {
      return { ticker: sym, error: "insufficient history", score: -1 };
    }

    // 15-minute bars — for the multi-timeframe column (and the primary set when
    // the user picks the 15m window). Best-effort: optional.
    let intra = null;
    try {
      const raw = await data.getIntradayBars(sym, "15m", "5d");
      if (Array.isArray(raw) && raw.length >= 30) intra = intradayToArrays(raw);
    } catch { /* intraday optional */ }

    const dailyTF = analyzeTF(daily);
    const intraTF = intra ? analyzeTF(intra) : null;

    // Primary timeframe — falls back to daily if 15m data is unavailable.
    const usingIntraday = primaryTf === "15m" && !!intraTF;
    const primary = usingIntraday ? intraTF : dailyTF;
    const primaryBars = usingIntraday ? intra : daily;
    const primary_tf = usingIntraday ? "15m" : "daily";

    // Price block — always the daily session.
    const N = daily.closes.length;
    const last = daily.closes[N - 1];
    const prev = daily.closes[N - 2];
    const open = daily.opens[N - 1];
    const high = daily.highs[N - 1];
    const low  = daily.lows[N - 1];
    const vol  = daily.volumes[N - 1];
    const netChg = prev != null ? last - prev : null;
    const chgPct = prev ? ((last - prev) / prev) * 100 : 0;

    // Standard floor-trader pivots from yesterday's daily bar.
    const pivots = calculatePivots(daily.highs[N - 2], daily.lows[N - 2], prev);
    const zone   = pivotZone(last, pivots);

    // Relative volume on the primary timeframe.
    const pv = primaryBars.volumes;
    const avgVol = pv.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, pv.length);
    const volX = avgVol ? pv[pv.length - 1] / avgVol : null;

    // Classify + multi-timeframe agreement.
    const { opp, why, direction, breakout } = classify(primary, pivots, primary.last, volX);
    const { mtf, mtf_dir } = multiTimeframe(intraTF?.dir || null, dailyTF.dir);

    // IV / HV + gamma proxy — best-effort from the option chain.
    let iv_atm = null, iv_hv = null;
    let gamma = { gamma_wall: null, gamma_flag: "", gamma_note: null, call_put_oi: null };
    const hv = realizedVol(daily.closes, 20);
    const chain = await withTimeout(data.getOptionChain(sym), 8000);
    if (chain?.contracts?.length) {
      iv_atm = atmIV(chain.contracts, last);
      if (iv_atm != null && hv && hv > 0) iv_hv = iv_atm / hv;
      gamma = gammaProxy(chain.contracts, last);
    }

    return {
      ticker: sym,
      // price block
      last:     round(last, 2),
      mark:     round((high + low + last) / 3, 2),
      open:     round(open, 2),
      high:     round(high, 2),
      low:      round(low, 2),
      net_chg:  round(netChg, 2),
      change_pct: round(chgPct, 2),
      // pivots + structure
      pivots: {
        PP: round(pivots.PP, 2),
        R1: round(pivots.R1, 2), R2: round(pivots.R2, 2),
        S1: round(pivots.S1, 2), S2: round(pivots.S2, 2),
      },
      pivot_zone: zone,
      // momentum — on the primary timeframe
      primary_tf,
      trend:    (primary.adx.trend || "Neutral").toUpperCase(),
      rsi:      round(primary.rsi, 1),
      adx:      round(primary.adx.adx, 1),
      // multi-timeframe
      mtf,
      mtf_dir,
      // volatility
      iv_atm:   round(iv_atm, 1),
      iv_hv:    round(iv_hv, 2),
      hv:       round(hv, 1),
      // volume
      volume:   vol,
      volume_x_avg: round(volX, 2),
      // squeeze + breakout + gamma
      ttm_squeeze: squeezeLabel(primary.squeeze),
      breakout,
      gamma_wall: gamma.gamma_wall,
      gamma_flag: gamma.gamma_flag,
      gamma_note: gamma.gamma_note,
      call_put_oi: gamma.call_put_oi,
      // classifier
      opportunity: opp,
      direction,
      score: OPP_SCORES[opp] ?? 0,
      why,
    };
  } catch (e) {
    return { ticker: sym, error: `${e.message}`, score: -1 };
  }
}

router.get("/", async (req, res) => {
  const raw = (req.query.symbols || "").toString().trim();
  const timeframe = (req.query.timeframe || "daily").toString().toLowerCase() === "15m"
    ? "15m" : "daily";
  const symbols = raw
    ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 70)
    : DEFAULT_LIST;
  const start = Date.now();
  try {
    const results = await runPool(symbols, (s) => screenOne(s, timeframe), CONCURRENCY);
    res.json({
      results,
      count: results.length,
      ok_count: results.filter((r) => !r.error).length,
      error_count: results.filter((r) => r.error).length,
      timeframe,
      concurrency: CONCURRENCY,
      elapsed_ms: Date.now() - start,
      cached: false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
