// BandaruChart — multi-pane canvas chart (price + EMA + Volume + MACD + TTM Squeeze).
// Pure-JS class, ported from the Python static/js/chart.js. Used by ChartAnalysis.jsx.

// Tuned for a TradingView / ThinkOrSwim feel: muted grid, vibrant
// candles, distinct colors per overlay line, high-contrast labels.
const COLORS = {
  grid: "#1e252e", gridMajor: "#2a323d", axis: "#b8c0cc",
  bg: "#0b0f15",
  bull: "#26d96e", bear: "#ef4f6b",
  pivotPP: "#ffd966", pivotR: "#ff7a8c", pivotS: "#26d96e",
  cprBand: "rgba(124,154,255,0.10)", cprEdge: "#7c9aff", cprPivot: "#c7a3ff",
  // EMA stack: warm-yellow for 9 (fastest), cyan for 21, orange for 200 (slow trend).
  ema9:   "#ffd966",
  ema21:  "#00d4ff",
  ema200: "#ff8c42",
  vwap:   "#c084fc",  // distinct purple so VWAP doesn't blur into the EMAs
  macdLine: "#58a6ff", macdSignal: "#ff8c00",
  macdHistBull: "rgba(38,217,110,0.7)", macdHistBear: "rgba(255,122,140,0.7)",
  volBull: "rgba(38,217,110,0.35)", volBear: "rgba(239,79,107,0.35)",
  // Signal markers
  buyFill:  "#26d96e", buyEdge: "#ffffff",
  sellFill: "#ef4f6b", sellEdge: "#ffffff",
};

// ---------- Indicator helpers ----------
function ema(values, period) {
  if (!values?.length) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

function computeMACD(closes, fast = 12, slow = 26, sigP = 9) {
  const eF = ema(closes, fast);
  const eS = ema(closes, slow);
  const macd = closes.map((_, i) => eF[i] != null && eS[i] != null ? eF[i] - eS[i] : null);
  const validStart = macd.findIndex((v) => v != null);
  const signal = new Array(closes.length).fill(null);
  if (validStart >= 0) {
    const sub = macd.slice(validStart).map((v) => v ?? 0);
    const sig = ema(sub, sigP);
    for (let i = 0; i < sig.length; i++) if (sig[i] != null) signal[validStart + i] = sig[i];
  }
  const hist = macd.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null);
  return { macd, signal, hist };
}

// Cumulative session VWAP. Resets when the ET date changes between bars.
// The "ET date" comes from the bar timestamp converted to America/New_York —
// this is what makes overnight + multi-day intraday charts produce the
// expected piecewise-VWAP that traders use.
function computeVWAP(bars) {
  const n = bars.length;
  const out = new Array(n).fill(null);
  let cumPV = 0, cumV = 0, curDate = null;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const d = new Date(b.t);
    // ET date key — "YYYY-MM-DD" via toLocaleDateString in NY tz
    const etDate = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (etDate !== curDate) { cumPV = 0; cumV = 0; curDate = etDate; }
    const tp = (b.h + b.l + b.c) / 3;
    const v = b.v || 0;
    cumPV += tp * v;
    cumV  += v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

// Trend stack at bar i: true UP if close > ema9 > ema21 > vwap > ema200.
// Inverse for DOWN. Anything else is neutral. Pivot-level signals only
// fire in a confirmed trend — otherwise pivots are just zones, not setups.
function trendAt(i, closes, e9, e21, e200, vwapArr) {
  if (closes[i] == null) return "neutral";
  const c = closes[i], a = e9[i], b = e21[i], v = vwapArr[i], d = e200[i];
  if ([a, b, v, d].some((x) => x == null)) return "neutral";
  if (c > a && a > b && b > v && v > d) return "up";
  if (c < a && a < b && b < v && v < d) return "down";
  return "neutral";
}

// Buy/sell markers fire when an in-trend bar TOUCHES a pivot level.
// "Touch" = the pivot price falls within the bar's intrabar range [low, high].
// Up-trend touch of any support (PP, S1, S2, S3) → BUY arrow.
// Down-trend touch of any resistance (PP, R1, R2, R3) → SELL arrow.
// At most one marker per bar to keep the chart readable.
function detectPivotSignals(bars, pivots, trends) {
  const sigs = [];
  if (!pivots) return sigs;
  const supports    = ["PP", "S1", "S2", "S3"].filter((k) => pivots[k] != null);
  const resistances = ["PP", "R1", "R2", "R3"].filter((k) => pivots[k] != null);
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (b == null) continue;
    if (trends[i] === "up") {
      const hit = supports.find((k) => b.l <= pivots[k] && pivots[k] <= b.h);
      if (hit) { sigs.push({ i, type: "buy", level: hit, price: pivots[hit] }); continue; }
    }
    if (trends[i] === "down") {
      const hit = resistances.find((k) => b.l <= pivots[k] && pivots[k] <= b.h);
      if (hit) { sigs.push({ i, type: "sell", level: hit, price: pivots[hit] }); }
    }
  }
  return sigs;
}

function computeHeikinAshi(bars) {
  if (!bars?.length) return [];
  const out = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haC = (b.o + b.h + b.l + b.c) / 4;
    const haO = i === 0 ? (b.o + b.c) / 2 : (out[i - 1].o + out[i - 1].c) / 2;
    out[i] = {
      t: b.t, o: haO, c: haC,
      h: Math.max(b.h, haO, haC),
      l: Math.min(b.l, haO, haC),
      v: b.v,
    };
  }
  return out;
}

// ---------- Main class ----------
export class BandaruChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bars = [];
    this.pivots = null;
    this.cpr = null;
    this.showCpr = true;
    this.candleStyle = "regular";  // regular | heikin
    this.viewStart = 0;
    this.viewSlots = null;
    this._setupHiDPI();
    // Keep a handler reference so destroy() can detach it (an inline arrow
    // can't be removed, which would leak the instance if the chart is rebuilt).
    this._onWheelBound = (e) => this._onWheel(e);
    this.canvas.addEventListener("wheel", this._onWheelBound, { passive: false });
    // Re-measure whenever the canvas's box changes — fixes the case where the
    // canvas had zero size at construction (parent not yet laid out) and the
    // case where the user resizes the window after the chart is mounted.
    // Without this, draw() runs against a stale w/h of 0 and renders nothing.
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      this._ro = new ResizeObserver(() => {
        this._setupHiDPI();
        this.draw();
      });
      this._ro.observe(this.canvas);
    }
  }

  // Detach DOM listeners so the instance can be garbage-collected. Call this
  // from the React component's effect cleanup when the chart is torn down.
  destroy() {
    if (this._onWheelBound) {
      this.canvas.removeEventListener("wheel", this._onWheelBound);
      this._onWheelBound = null;
    }
    if (this._ro) {
      try { this._ro.disconnect(); } catch (_e) { /* ignore */ }
      this._ro = null;
    }
  }

  _setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.w = rect.width;
    this.h = rect.height;
  }

  setData({ bars, pivots, cpr, interval, period }) {
    this.bars = bars || [];
    this.pivots = pivots || null;
    if (cpr !== undefined) this.cpr = cpr || null;
    this.interval = interval || "5m";
    this.period = period || "1d";
    this.viewStart = 0; this.viewSlots = null;
    this._setupHiDPI();
    this.draw();
  }

  setCandleStyle(style) {
    if (["regular", "heikin"].includes(style)) {
      this.candleStyle = style;
      this.draw();
    }
  }

  setShowCpr(on) {
    this.showCpr = !!on;
    this.draw();
  }

  zoomBy(factor) {
    const total = this.bars.length;
    if (!total) return;
    const cur = this.viewSlots || total;
    const next = Math.max(4, Math.min(total, Math.round(cur * factor)));
    this.viewSlots = next >= total ? null : next;
    this.draw();
  }

  zoomReset() { this.viewSlots = null; this.viewStart = 0; this.draw(); }

  _onWheel(e) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 0.8 : 1.25);
  }

  _displayBars() {
    return this.candleStyle === "heikin" ? computeHeikinAshi(this.bars) : this.bars;
  }

  // Return the buy/sell signals computed on the most recent draw, enriched
  // with the bar timestamp so the React layer can render a signal list.
  // Empty array if nothing fired (or before the first draw).
  getSignals() {
    const sigs = this._lastSignals || [];
    return sigs.map((s) => ({
      ...s,
      time: this.bars[s.i]?.t || null,
    }));
  }

  // Public setter for an empty-state message — ChartAnalysis flips this when
  // /api/candles returns empty bars or an error. Without it, an empty
  // bars array leaves the canvas pure-black and looks broken.
  setStatus(text) {
    this._statusMsg = text || null;
    this.draw();
  }

  // ---------- The big draw ----------
  draw() {
    // Re-measure each draw — handles the case where the canvas was 0×0 at
    // construction time (parent flexbox not yet laid out) and we now have a
    // real size, plus any container resize since the last draw.
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && (Math.abs(rect.width - this.w) > 0.5 || Math.abs(rect.height - this.h) > 0.5)) {
      this._setupHiDPI();
    }
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (!this.bars.length) {
      // No data — render a centered status message instead of leaving the
      // canvas blank. Tells the user we're loading / why nothing is drawn.
      const msg = this._statusMsg || "Waiting for chart data…";
      c.fillStyle = "#97a1ab";
      c.font = "14px -apple-system, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(msg, this.w / 2, this.h / 2);
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      return;
    }

    // Layout: price | volume | macd | ttm (top-to-bottom)
    const RIGHT = 70, BOTTOM = 22;
    const priceW = this.w - RIGHT;
    const priceH = this.h * 0.55;
    const volH = this.h * 0.12;
    const macdH = this.h * 0.18;
    const ttmH  = this.h * 0.10;
    const volY = priceH + 4;
    const macdY = volY + volH + 4;
    const ttmY = macdY + macdH + 4;

    // y-range from bars + pivots
    let lo = Infinity, hi = -Infinity, vMax = 0;
    for (const b of this._displayBars()) {
      if (b.l < lo) lo = b.l;
      if (b.h > hi) hi = b.h;
      if (b.v > vMax) vMax = b.v;
    }
    if (this.pivots) {
      for (const v of Object.values(this.pivots)) {
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    if (this.showCpr && this.cpr) {
      for (const v of [this.cpr.tc, this.cpr.bc, this.cpr.pivot]) {
        if (v != null && v < lo) lo = v;
        if (v != null && v > hi) hi = v;
      }
    }
    const pad = (hi - lo) * 0.04 || 1;
    lo -= pad; hi += pad;
    const yPrice = (p) => priceH * (1 - (p - lo) / (hi - lo));

    const total = this.bars.length;
    const visible = this.viewSlots || total;
    const barW = Math.min(18, priceW / visible);
    const candleW = Math.max(2, barW * 0.85);
    const xBar = (i) => (i - this.viewStart) * barW + barW / 2;

    // ---- Grid + price labels ----
    c.font = "10px -apple-system, sans-serif";
    c.strokeStyle = COLORS.grid; c.fillStyle = COLORS.axis;
    for (let i = 0; i <= 6; i++) {
      const y = (priceH / 6) * i;
      const p = hi - ((hi - lo) / 6) * i;
      c.beginPath(); c.moveTo(0, y); c.lineTo(priceW, y); c.stroke();
      c.fillText(p.toFixed(2), priceW + 4, y + 4);
    }

    // ---- CPR band (Central Pivot Range) ----
    if (this.showCpr && this.cpr && this.cpr.tc != null && this.cpr.bc != null) {
      const yTC = yPrice(this.cpr.tc);
      const yBC = yPrice(this.cpr.bc);
      const yP  = yPrice(this.cpr.pivot);
      const bandTop = Math.min(yTC, yBC);
      const bandH = Math.max(1, Math.abs(yBC - yTC));
      c.fillStyle = COLORS.cprBand;
      c.fillRect(0, bandTop, priceW, bandH);
      c.setLineDash([2, 3]); c.lineWidth = 1;
      c.strokeStyle = COLORS.cprEdge;
      for (const y of [yTC, yBC]) {
        if (y < -2 || y > priceH + 2) continue;
        c.beginPath(); c.moveTo(0, y); c.lineTo(priceW, y); c.stroke();
      }
      c.setLineDash([]);
      // central pivot — solid
      if (yP >= -2 && yP <= priceH + 2) {
        c.strokeStyle = COLORS.cprPivot; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(0, yP); c.lineTo(priceW, yP); c.stroke();
      }
      // edge labels
      c.font = "bold 9px -apple-system, sans-serif";
      for (const [lab, val, y, col] of [
        ["TC", this.cpr.tc, yTC, COLORS.cprEdge],
        ["P",  this.cpr.pivot, yP, COLORS.cprPivot],
        ["BC", this.cpr.bc, yBC, COLORS.cprEdge],
      ]) {
        if (y < -2 || y > priceH + 2) continue;
        const text = `${lab} ${val.toFixed(2)}`;
        const tw = c.measureText(text).width + 8;
        c.fillStyle = col;
        c.fillRect(priceW - tw - 2, y - 8, tw, 15);
        c.fillStyle = "#0d1117";
        c.fillText(text, priceW - tw + 2, y + 3);
      }
      c.font = "10px -apple-system, sans-serif";
    }

    // ---- Pivot lines ----
    if (this.pivots) {
      c.setLineDash([3, 4]); c.lineWidth = 1.4;
      for (const [k, v] of Object.entries(this.pivots)) {
        const y = yPrice(v);
        if (y < -2 || y > priceH + 2) continue;
        const isPP = k === "PP", isR = k.startsWith("R");
        c.strokeStyle = isPP ? COLORS.pivotPP : isR ? COLORS.pivotR : COLORS.pivotS;
        c.beginPath(); c.moveTo(0, y); c.lineTo(priceW, y); c.stroke();
        c.setLineDash([]);
        const text = `${k} ${v.toFixed(2)}`;
        const tw = c.measureText(text).width + 8;
        c.fillStyle = c.strokeStyle;
        c.fillRect(priceW + 2, y - 8, tw, 16);
        c.fillStyle = isPP ? "#000" : "#fff";
        c.font = "bold 10px -apple-system, sans-serif";
        c.fillText(text, priceW + 5, y + 4);
        c.font = "10px -apple-system, sans-serif";
        c.setLineDash([3, 4]);
      }
      c.setLineDash([]);
    }

    // ---- Candles + EMAs ----
    const renderBars = this._displayBars();
    c.save(); c.beginPath(); c.rect(0, 0, this.w, ttmY + ttmH); c.clip();
    for (let i = 0; i < renderBars.length; i++) {
      if (this.viewSlots != null && (i < this.viewStart || i >= this.viewStart + this.viewSlots)) continue;
      const b = renderBars[i];
      const cx = xBar(i);
      const bull = b.c >= b.o;
      c.strokeStyle = bull ? COLORS.bull : COLORS.bear;
      c.fillStyle = c.strokeStyle;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx, yPrice(b.h)); c.lineTo(cx, yPrice(b.l)); c.stroke();
      const bodyTop = Math.min(yPrice(b.o), yPrice(b.c));
      const bodyH = Math.max(2.5, Math.abs(yPrice(b.c) - yPrice(b.o)));
      c.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);
    }

    // ---- Overlay lines: 9/21/200 EMA + VWAP ----
    // The user's signal stack:  close > EMA9 > EMA21 > VWAP > EMA200  =  UP
    //                           close < EMA9 < EMA21 < VWAP < EMA200  =  DOWN
    // These four series + the close are what feeds the trend gate below.
    const realCloses = this.bars.map((b) => b.c);
    const e9   = ema(realCloses, 9);
    const e21  = ema(realCloses, 21);
    const e200 = ema(realCloses, 200);
    const vwapArr = computeVWAP(this.bars);

    const overlays = [
      { label: "EMA 9",   series: e9,      color: COLORS.ema9,   width: 1.6 },
      { label: "EMA 21",  series: e21,     color: COLORS.ema21,  width: 1.6 },
      { label: "VWAP",    series: vwapArr, color: COLORS.vwap,   width: 1.8, dash: [4, 3] },
      { label: "EMA 200", series: e200,    color: COLORS.ema200, width: 2.0 },
    ];
    for (const { series, color, width, dash } of overlays) {
      c.strokeStyle = color; c.lineWidth = width;
      if (dash) c.setLineDash(dash); else c.setLineDash([]);
      c.beginPath();
      let started = false;
      for (let i = 0; i < series.length; i++) {
        if (series[i] == null) continue;
        const cx = xBar(i), y = yPrice(series[i]);
        if (!started) { c.moveTo(cx, y); started = true; }
        else c.lineTo(cx, y);
      }
      c.stroke();
    }
    c.setLineDash([]);

    // ---- Buy / Sell signals at pivot levels (in-trend touches) ----
    // Implements the user's spec: "buy signal NOT showing when it went to
    // support level 3" — previous build only fired on EMA cross, never on
    // a pivot touch. Now every PP/S1/S2/S3 touch during a confirmed up-trend
    // produces a BUY arrow below the candle; every PP/R1/R2/R3 touch during
    // a confirmed down-trend produces a SELL arrow above it.
    const trends = new Array(this.bars.length);
    for (let i = 0; i < this.bars.length; i++) {
      trends[i] = trendAt(i, realCloses, e9, e21, e200, vwapArr);
    }
    const signals = detectPivotSignals(this.bars, this.pivots, trends);
    this._lastSignals = signals;  // exposed via getSignals() for the UI panel
    const aSize = Math.max(7, Math.min(11, barW * 1.1));
    for (const sig of signals) {
      const cx = xBar(sig.i);
      const bar = this.bars[sig.i];
      if (sig.type === "buy") {
        const y = yPrice(bar.l) + aSize * 0.6;
        c.fillStyle = COLORS.buyFill;
        c.strokeStyle = COLORS.buyEdge; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, y);
        c.lineTo(cx - aSize / 2, y + aSize);
        c.lineTo(cx + aSize / 2, y + aSize);
        c.closePath(); c.fill(); c.stroke();
        // Tiny label so the trader can see WHICH support fired.
        c.fillStyle = COLORS.buyEdge;
        c.font = "bold 9px -apple-system, sans-serif";
        c.textAlign = "center";
        c.fillText(sig.level, cx, y + aSize + 10);
        c.textAlign = "left";
      } else {
        const y = yPrice(bar.h) - aSize * 0.6;
        c.fillStyle = COLORS.sellFill;
        c.strokeStyle = COLORS.sellEdge; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, y);
        c.lineTo(cx - aSize / 2, y - aSize);
        c.lineTo(cx + aSize / 2, y - aSize);
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = COLORS.sellEdge;
        c.font = "bold 9px -apple-system, sans-serif";
        c.textAlign = "center";
        c.fillText(sig.level, cx, y - aSize - 3);
        c.textAlign = "left";
      }
    }
    c.restore();

    // ---- Legend overlay (top-left) — which color is which line ----
    // ThinkOrSwim / TradingView convention: small floating panel naming the
    // overlays + their current value at the last bar.
    const legendItems = [
      { label: "EMA 9",   color: COLORS.ema9,   v: e9.at(-1) },
      { label: "EMA 21",  color: COLORS.ema21,  v: e21.at(-1) },
      { label: "VWAP",    color: COLORS.vwap,   v: vwapArr.at(-1) },
      { label: "EMA 200", color: COLORS.ema200, v: e200.at(-1) },
    ];
    c.font = "bold 11px -apple-system, sans-serif";
    let lx = 8, ly = 8;
    const rowH = 16, swatchW = 14;
    // Translucent background so the legend stays readable over candles.
    const legendW = 130, legendH = rowH * legendItems.length + 8;
    c.fillStyle = "rgba(11,15,21,0.78)";
    c.strokeStyle = COLORS.gridMajor;
    c.fillRect(lx, ly, legendW, legendH);
    c.strokeRect(lx, ly, legendW, legendH);
    for (let i = 0; i < legendItems.length; i++) {
      const it = legendItems[i];
      const ry = ly + 6 + i * rowH;
      c.fillStyle = it.color;
      c.fillRect(lx + 6, ry + 3, swatchW, 4);
      c.fillStyle = "#e6edf3";
      const valTxt = it.v != null && isFinite(it.v) ? it.v.toFixed(2) : "—";
      c.fillText(`${it.label}  ${valTxt}`, lx + 6 + swatchW + 6, ry + 10);
    }

    // Trend badge — at-a-glance current stack state.
    const lastTrend = trends[trends.length - 1];
    if (lastTrend !== "neutral") {
      const txt = lastTrend === "up" ? "UPTREND" : "DOWNTREND";
      const col = lastTrend === "up" ? COLORS.bull : COLORS.bear;
      c.font = "bold 11px -apple-system, sans-serif";
      const tw = c.measureText(txt).width + 14;
      c.fillStyle = col;
      c.fillRect(lx + legendW + 8, ly + 2, tw, 18);
      c.fillStyle = "#0b0f15";
      c.fillText(txt, lx + legendW + 15, ly + 14);
    }

    // ---- Volume pane ----
    c.fillStyle = COLORS.axis; c.font = "10px -apple-system, sans-serif";
    c.fillText("VOL", 4, volY + 10);
    for (let i = 0; i < this.bars.length; i++) {
      if (this.viewSlots != null && (i < this.viewStart || i >= this.viewStart + this.viewSlots)) continue;
      const b = this.bars[i];
      const cx = xBar(i);
      const vh = vMax ? (b.v / vMax) * volH : 0;
      c.fillStyle = b.c >= b.o ? COLORS.volBull : COLORS.volBear;
      c.fillRect(cx - candleW / 2, volY + (volH - vh), candleW, vh);
    }

    // ---- MACD pane ----
    const macd = computeMACD(realCloses);
    let macdMax = 0;
    for (let i = 0; i < this.bars.length; i++) {
      if (macd.macd[i] != null) macdMax = Math.max(macdMax, Math.abs(macd.macd[i]));
      if (macd.signal[i] != null) macdMax = Math.max(macdMax, Math.abs(macd.signal[i]));
      if (macd.hist[i] != null) macdMax = Math.max(macdMax, Math.abs(macd.hist[i]));
    }
    if (macdMax === 0) macdMax = 1;
    const zeroY = macdY + macdH / 2;
    const macdScale = (v) => zeroY - (v / macdMax) * (macdH / 2 - 2);

    c.strokeStyle = COLORS.grid; c.beginPath(); c.moveTo(0, macdY); c.lineTo(priceW, macdY); c.stroke();
    c.strokeStyle = "rgba(151,161,171,0.4)"; c.beginPath(); c.moveTo(0, zeroY); c.lineTo(priceW, zeroY); c.stroke();
    c.fillStyle = COLORS.axis; c.fillText("MACD (12, 26, 9)", 4, macdY + 12);

    for (let i = 0; i < this.bars.length; i++) {
      if (this.viewSlots != null && (i < this.viewStart || i >= this.viewStart + this.viewSlots)) continue;
      if (macd.hist[i] == null) continue;
      const cx = xBar(i);
      const y0 = zeroY, y1 = macdScale(macd.hist[i]);
      c.fillStyle = macd.hist[i] >= 0 ? COLORS.macdHistBull : COLORS.macdHistBear;
      c.fillRect(cx - candleW / 2, Math.min(y0, y1), candleW, Math.abs(y1 - y0));
    }
    for (const [series, color] of [[macd.macd, COLORS.macdLine], [macd.signal, COLORS.macdSignal]]) {
      c.strokeStyle = color; c.lineWidth = 1.5; c.beginPath();
      let started = false;
      for (let i = 0; i < this.bars.length; i++) {
        if (series[i] == null) continue;
        const cx = xBar(i), y = macdScale(series[i]);
        if (!started) { c.moveTo(cx, y); started = true; }
        else c.lineTo(cx, y);
      }
      c.stroke();
    }

    // ---- Time axis ----
    c.strokeStyle = COLORS.grid; c.beginPath(); c.moveTo(0, ttmY + ttmH); c.lineTo(priceW, ttmY + ttmH); c.stroke();
    c.fillStyle = COLORS.axis; c.textAlign = "center";
    const tickCount = Math.min(8, Math.max(4, Math.floor(this.w / 130)));
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.floor(((this.bars.length - 1) * i) / Math.max(1, tickCount - 1));
      const b = this.bars[idx];
      if (!b) continue;
      const cx = xBar(idx);
      const d = new Date(b.t);
      const label = this.interval && !["1d","1wk","1mo"].includes(this.interval)
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
      c.fillText(label, cx, this.h - 4);
    }
    c.textAlign = "left";
  }
}
