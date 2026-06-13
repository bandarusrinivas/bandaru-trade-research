// Technical indicators — ported from src/indicators.py and src/pro_indicators.py
// All math identical to the Python implementation. Pure functions, no I/O.

// ---------- Simple Moving Average ----------
export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ---------- Exponential Moving Average ----------
export function ema(values, period) {
  if (!values?.length || period <= 0) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ---------- Relative Strength Index ----------
export function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---------- MACD (12, 26, 9) ----------
export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const eF = ema(values, fast);
  const eS = ema(values, slow);
  const macdLine = values.map((_, i) =>
    eF[i] != null && eS[i] != null ? eF[i] - eS[i] : null,
  );
  const validStart = macdLine.findIndex((v) => v != null);
  let signal = new Array(values.length).fill(null);
  if (validStart >= 0) {
    const sub = macdLine.slice(validStart).map((v) => v ?? 0);
    const sig = ema(sub, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] != null) signal[validStart + i] = sig[i];
    }
  }
  const hist = macdLine.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i] : null,
  );
  const lastHist = hist[hist.length - 1];
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signal[signal.length - 1],
    histogram: lastHist,
    trend: lastHist == null ? "neutral" : lastHist > 0 ? "bullish" : lastHist < 0 ? "bearish" : "neutral",
  };
}

// ---------- ATR (Average True Range) — Wilder smoothing ----------
export function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [0];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let last = sum / period;
  for (let i = period + 1; i < closes.length; i++) {
    last = (last * (period - 1) + trs[i]) / period;
  }
  return last;
}

// ---------- ADX (Wilder) with +DI / -DI ----------
export function adx(highs, lows, closes, period = 14) {
  if (closes.length < period * 2 + 1) {
    return { adx: null, plus_di: null, minus_di: null, trend: null, strength: null };
  }
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const wilder = (vals, p) => {
    if (vals.length < p) return [];
    const out = [vals.slice(0, p).reduce((a, b) => a + b, 0)];
    for (let i = p; i < vals.length; i++) out.push(out[out.length - 1] - out[out.length - 1] / p + vals[i]);
    return out;
  };
  const smTr = wilder(tr, period);
  const smPlus = wilder(plusDM, period);
  const smMinus = wilder(minusDM, period);
  if (!smTr.length || smTr[smTr.length - 1] === 0) {
    return { adx: null, plus_di: null, minus_di: null, trend: null, strength: null };
  }
  const plusDi = smTr.map((t, i) => (t ? 100 * (smPlus[i] / t) : 0));
  const minusDi = smTr.map((t, i) => (t ? 100 * (smMinus[i] / t) : 0));
  const dx = plusDi.map((p, i) => {
    const denom = p + minusDi[i];
    return denom ? (100 * Math.abs(p - minusDi[i])) / denom : 0;
  });
  if (dx.length < period) return { adx: null, plus_di: null, minus_di: null };
  const adxSmoothed = wilder(dx, period);
  if (!adxSmoothed.length) return { adx: null, plus_di: null, minus_di: null };
  const adxVal = adxSmoothed[adxSmoothed.length - 1] / period;
  const plus = plusDi[plusDi.length - 1];
  const minus = minusDi[minusDi.length - 1];
  const strength =
    adxVal >= 40 ? "Very Strong" : adxVal >= 25 ? "Strong" : adxVal >= 20 ? "Developing" : "Ranging";
  return {
    adx: Math.round(adxVal * 100) / 100,
    plus_di: Math.round(plus * 100) / 100,
    minus_di: Math.round(minus * 100) / 100,
    trend: plus > minus ? "Bullish" : "Bearish",
    strength,
  };
}

// ---------- VWAP (Volume Weighted Average Price) ----------
// Cumulative session VWAP from the first bar provided.
//   VWAP[i] = Σ (typical[k] · volume[k]) / Σ volume[k]   for k = 0..i
//   typical[k] = (high[k] + low[k] + close[k]) / 3
//
// Caller controls session boundaries by passing the right slice of bars.
// For a single-day intraday chart, just pass that day's bars — the VWAP
// will reset naturally because the cumulative sums start fresh.
//
// For multi-day intraday data, callers should reset VWAP at each session
// open (use computeSessionVWAP below, which detects session boundaries
// from a parallel "session id" array — typically the ET date string).
export function vwap(highs, lows, closes, volumes) {
  const n = closes?.length || 0;
  const out = new Array(n).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] || 0;
    cumPV += tp * v;
    cumV  += v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

// Session-aware VWAP — resets the cumulative sums when sessionIds[i] differs
// from sessionIds[i-1]. Pass an array of ET date strings (one per bar) and
// the VWAP starts fresh at each new trading day.
export function vwapBySession(highs, lows, closes, volumes, sessionIds) {
  const n = closes?.length || 0;
  const out = new Array(n).fill(null);
  let cumPV = 0, cumV = 0, currentSession = null;
  for (let i = 0; i < n; i++) {
    if (sessionIds[i] !== currentSession) {
      cumPV = 0; cumV = 0;
      currentSession = sessionIds[i];
    }
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] || 0;
    cumPV += tp * v;
    cumV  += v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

// ---------- Bollinger Bands ----------
export function bbands(values, period = 20, mult = 2.0) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mean + mult * std, middle: mean, lower: mean - mult * std };
}

// ---------- Floor-trader pivot points ----------
export function calculatePivots(high, low, close) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    R3: round(r3), R2: round(r2), R1: round(r1),
    PP: round(pp),
    S1: round(s1), S2: round(s2), S3: round(s3),
  };
}

// ---------- Central Pivot Range (CPR) ----------
// CPR is a three-line band derived from the prior session's H/L/C:
//   Pivot (P)        = (H + L + C) / 3
//   Bottom Central   = (H + L) / 2
//   Top Central (TC) = 2P - BC   (mirror of BC across P)
// The two "central" lines are ordered into top/bottom because TC can sit
// below BC when the close finishes mid-range.
//
// Width carries the signal traders use it for: a NARROW CPR (small width
// relative to price) tends to precede a trending day, a WIDE CPR a
// rangebound / sideways day. The narrow/wide buckets here are a rough
// heuristic, not a guarantee.
export function calculateCPR(high, low, close) {
  if ([high, low, close].some((v) => v == null || !isFinite(v))) {
    return null;
  }
  const round = (n) => Math.round(n * 100) / 100;
  const P  = (high + low + close) / 3;
  const BC = (high + low) / 2;
  const TC = 2 * P - BC;
  const top = Math.max(TC, BC);
  const bottom = Math.min(TC, BC);
  const width = top - bottom;
  const widthPct = close ? (width / close) * 100 : 0;
  let type;
  if (widthPct < 0.10)      type = "narrow";
  else if (widthPct < 0.25) type = "moderate";
  else                      type = "wide";
  const bias = type === "narrow" ? "trending day likely"
             : type === "wide"   ? "rangebound day likely"
             : "mixed — no strong CPR bias";
  return {
    pivot:      round(P),
    tc:         round(top),
    bc:         round(bottom),
    width:      round(width),
    width_pct:  Math.round(widthPct * 1000) / 1000,
    type,
    bias,
  };
}

// ---------- TTM Squeeze ----------
export function ttmSqueeze(highs, lows, closes, period = 20, bbMult = 2, kcMult = 1.5) {
  if (closes.length < period + 1) return { in_squeeze: null, momentum: null, fired: null };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upBB = mean + bbMult * std;
  const loBB = mean - bbMult * std;
  const a = atr(highs, lows, closes, period);
  if (a == null) return { in_squeeze: null, momentum: null, fired: null };
  const upKC = mean + kcMult * a;
  const loKC = mean - kcMult * a;
  const inSqueeze = loBB > loKC && upBB < upKC;
  const hh = Math.max(...highs.slice(-period));
  const ll = Math.min(...lows.slice(-period));
  const mid = ((hh + ll) / 2 + mean) / 2;
  const momentum = closes[closes.length - 1] - mid;
  const prevSlice = closes.slice(-period - 1, -1);
  const prevMean = prevSlice.reduce((a, b) => a + b, 0) / period;
  const prevVar = prevSlice.reduce((a, b) => a + (b - prevMean) ** 2, 0) / period;
  const prevStd = Math.sqrt(prevVar);
  const prevA = atr(highs.slice(0, -1), lows.slice(0, -1), closes.slice(0, -1), period);
  const prevInSqueeze = prevA != null && (prevMean - bbMult * prevStd) > (prevMean - kcMult * prevA) && (prevMean + bbMult * prevStd) < (prevMean + kcMult * prevA);
  let fired = null;
  if (prevInSqueeze && !inSqueeze) fired = momentum > 0 ? "bullish" : "bearish";
  return { in_squeeze: inSqueeze, momentum, fired };
}
