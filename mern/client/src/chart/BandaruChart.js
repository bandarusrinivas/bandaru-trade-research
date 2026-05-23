// BandaruChart — multi-pane canvas chart (price + EMA + Volume + MACD + TTM Squeeze).
// Pure-JS class, ported from the Python static/js/chart.js. Used by ChartAnalysis.jsx.

const COLORS = {
  grid: "#2a313a", axis: "#97a1ab",
  bull: "#26d96e", bear: "#ff7a8c",
  pivotPP: "#ffffff", pivotR: "#ff7a8c", pivotS: "#26d96e",
  cprBand: "rgba(124,154,255,0.14)", cprEdge: "#7c9aff", cprPivot: "#c7a3ff",
  ema8: "#00d4ff", ema21: "#58a6ff", ema50: "#ff7a8c",
  macdLine: "#58a6ff", macdSignal: "#ff8c00",
  macdHistBull: "rgba(38,217,110,0.7)", macdHistBear: "rgba(255,122,140,0.7)",
  volBull: "rgba(38,217,110,0.35)", volBear: "rgba(255,122,140,0.35)",
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
    this.canvas.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
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

  // ---------- The big draw ----------
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (!this.bars.length) return;

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

    // EMAs (always from real closes)
    const realCloses = this.bars.map((b) => b.c);
    const emas = [
      { period: 8,  color: COLORS.ema8 },
      { period: 21, color: COLORS.ema21 },
      { period: 50, color: COLORS.ema50 },
    ];
    c.lineWidth = 1.5;
    for (const { period, color } of emas) {
      const series = ema(realCloses, period);
      c.strokeStyle = color; c.beginPath();
      let started = false;
      for (let i = 0; i < series.length; i++) {
        if (series[i] == null) continue;
        const cx = xBar(i), y = yPrice(series[i]);
        if (!started) { c.moveTo(cx, y); started = true; }
        else c.lineTo(cx, y);
      }
      c.stroke();
    }

    // Buy/sell arrows on EMA 8/21 cross
    const e8 = ema(realCloses, 8), e21 = ema(realCloses, 21);
    const aSize = Math.max(5, Math.min(9, barW));
    for (let i = 1; i < this.bars.length; i++) {
      if (e8[i - 1] == null || e21[i - 1] == null || e8[i] == null || e21[i] == null) continue;
      const prev = e8[i - 1] - e21[i - 1];
      const cur  = e8[i] - e21[i];
      const cx = xBar(i);
      if (prev <= 0 && cur > 0) {
        c.fillStyle = COLORS.bull;
        const y = yPrice(this.bars[i].l) + aSize * 0.6;
        c.beginPath(); c.moveTo(cx, y); c.lineTo(cx - aSize / 2, y + aSize); c.lineTo(cx + aSize / 2, y + aSize); c.closePath(); c.fill();
      } else if (prev >= 0 && cur < 0) {
        c.fillStyle = COLORS.bear;
        const y = yPrice(this.bars[i].h) - aSize * 0.6;
        c.beginPath(); c.moveTo(cx, y); c.lineTo(cx - aSize / 2, y - aSize); c.lineTo(cx + aSize / 2, y - aSize); c.closePath(); c.fill();
      }
    }
    c.restore();

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
