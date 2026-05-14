// Bandaru native candle chart — clean, readable, no dependencies.
//
// Renders OHLCV bars with pivot S/R overlay, volume sub-pane,
// crosshair tooltip, and high-DPI canvas scaling.

(function () {
  const COLORS = {
    grid: "#2a313a",
    axis: "#97a1ab",
    // Reference-matched palette — bright green for bullish, coral pink for bearish
    bull: "#26d96e",
    bear: "#ff7a8c",
    bullFill: "#26d96e",
    bearFill: "#ff7a8c",
    volBull: "rgba(38,217,110,0.35)",
    volBear: "rgba(255,122,140,0.35)",
    pivotPP: "#ffffff",
    pivotR: "#ff7a8c",
    pivotS: "#26d96e",
    crosshair: "rgba(255,255,255,0.75)",
    text: "#e6edf3",
    muted: "#97a1ab",
    macdLine: "#58a6ff",       // blue
    macdSignal: "#ff8c00",     // orange
    macdHistBull: "rgba(38,217,110,0.7)",
    macdHistBear: "rgba(255,122,140,0.7)",
    bg: "#0d1117",
    arrowBuy: "#26d96e",
    arrowSell: "#ff7a8c",
  };

  // --- ATR (Wilder's smoothing) ---
  function atr(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return new Array(closes.length).fill(null);
    const trs = [0];
    for (let i = 1; i < closes.length; i++) {
      trs.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    const out = new Array(closes.length).fill(null);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += trs[i];
    out[period] = sum / period;
    for (let i = period + 1; i < closes.length; i++) {
      out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    }
    return out;
  }

  // --- TTM Squeeze (John Carter) ---
  // Returns { histogram[], inSqueeze[] } per bar.
  function computeTTMSqueeze(highs, lows, closes, period = 20, bbMult = 2, kcMult = 1.5) {
    const n = closes.length;
    const sma = (vals, p) => {
      const out = new Array(vals.length).fill(null);
      let s = 0;
      for (let i = 0; i < vals.length; i++) {
        s += vals[i];
        if (i >= p) s -= vals[i - p];
        if (i >= p - 1) out[i] = s / p;
      }
      return out;
    };
    const std = (vals, p) => {
      const means = sma(vals, p);
      const out = new Array(vals.length).fill(null);
      for (let i = p - 1; i < vals.length; i++) {
        let sq = 0;
        for (let j = i - p + 1; j <= i; j++) sq += (vals[j] - means[i]) ** 2;
        out[i] = Math.sqrt(sq / p);
      }
      return out;
    };
    const meanCloses = sma(closes, period);
    const stdCloses = std(closes, period);
    const atrSeries = atr(highs, lows, closes, period);
    const inSqueeze = new Array(n).fill(null);
    const momentum = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (meanCloses[i] == null || stdCloses[i] == null || atrSeries[i] == null) continue;
      const upBB = meanCloses[i] + bbMult * stdCloses[i];
      const loBB = meanCloses[i] - bbMult * stdCloses[i];
      const upKC = meanCloses[i] + kcMult * atrSeries[i];
      const loKC = meanCloses[i] - kcMult * atrSeries[i];
      inSqueeze[i] = (loBB > loKC) && (upBB < upKC);

      // Momentum = close - midpoint of (highest-high, lowest-low, sma) over period
      const windowH = highs.slice(i - period + 1, i + 1);
      const windowL = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...windowH);
      const ll = Math.min(...windowL);
      const mid = ((hh + ll) / 2 + meanCloses[i]) / 2;
      momentum[i] = closes[i] - mid;
    }
    return { momentum, inSqueeze };
  }

  // --- Heikin-Ashi transform ---
  // HA-Close = (O + H + L + C) / 4
  // HA-Open  = (prev HA-Open + prev HA-Close) / 2  (first bar = (O + C) / 2)
  // HA-High  = max(High, HA-Open, HA-Close)
  // HA-Low   = min(Low,  HA-Open, HA-Close)
  function computeHeikinAshi(bars) {
    if (!bars || !bars.length) return [];
    const out = new Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const haClose = (b.o + b.h + b.l + b.c) / 4;
      const haOpen = (i === 0)
        ? (b.o + b.c) / 2
        : (out[i - 1].o + out[i - 1].c) / 2;
      const haHigh = Math.max(b.h, haOpen, haClose);
      const haLow = Math.min(b.l, haOpen, haClose);
      out[i] = { t: b.t, o: haOpen, h: haHigh, l: haLow, c: haClose, v: b.v };
    }
    return out;
  }

  // --- Smooth Heikin-Ashi ---
  // Method (commonly used "Smoothed Heikin Ashi" / SHA):
  //   1. EMA-smooth the raw OHLC series (period1, default 10)
  //   2. Apply HA transform on the smoothed values
  //   3. EMA-smooth the resulting HA OHLC again (period2, default 10)
  // The double smoothing produces continuous color runs that are very easy
  // to read for trend direction — same purpose as ToS's "Smooth HA" study.
  function emaSimple(values, period) {
    if (!values.length) return [];
    const k = 2 / (period + 1);
    const out = new Array(values.length);
    out[0] = values[0];
    for (let i = 1; i < values.length; i++) {
      out[i] = values[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  function computeSmoothHeikinAshi(bars, period1 = 10, period2 = 10) {
    if (!bars || !bars.length) return [];
    const opens = bars.map((b) => b.o);
    const highs = bars.map((b) => b.h);
    const lows = bars.map((b) => b.l);
    const closes = bars.map((b) => b.c);
    // Step 1: EMA smooth raw OHLC
    const eo = emaSimple(opens, period1);
    const eh = emaSimple(highs, period1);
    const el = emaSimple(lows, period1);
    const ec = emaSimple(closes, period1);
    // Step 2: HA transform on smoothed values
    const ha = new Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      const haClose = (eo[i] + eh[i] + el[i] + ec[i]) / 4;
      const haOpen = (i === 0)
        ? (eo[i] + ec[i]) / 2
        : (ha[i - 1].o + ha[i - 1].c) / 2;
      const haHigh = Math.max(eh[i], haOpen, haClose);
      const haLow = Math.min(el[i], haOpen, haClose);
      ha[i] = { t: bars[i].t, o: haOpen, h: haHigh, l: haLow, c: haClose, v: bars[i].v };
    }
    // Step 3: EMA smooth the HA OHLC again
    const sO = emaSimple(ha.map((b) => b.o), period2);
    const sH = emaSimple(ha.map((b) => b.h), period2);
    const sL = emaSimple(ha.map((b) => b.l), period2);
    const sC = emaSimple(ha.map((b) => b.c), period2);
    const out = new Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      out[i] = {
        t: bars[i].t,
        o: sO[i],
        h: Math.max(sH[i], sO[i], sC[i]),
        l: Math.min(sL[i], sO[i], sC[i]),
        c: sC[i],
        v: bars[i].v,
      };
    }
    return out;
  }

  // --- MACD calculation (12/26 EMAs, 9 signal) ---
  function ema(values, period) {
    if (!values.length || period <= 0) return [];
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

  function computeMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
    const eF = ema(closes, fast);
    const eS = ema(closes, slow);
    const macd = closes.map((_, i) =>
      (eF[i] != null && eS[i] != null) ? eF[i] - eS[i] : null
    );
    // Build signal — only over the valid MACD subseries
    const validStart = macd.findIndex((v) => v != null);
    let signal = new Array(closes.length).fill(null);
    if (validStart >= 0) {
      const macdSub = macd.slice(validStart).map((v) => v == null ? 0 : v);
      const sig = ema(macdSub, signalPeriod);
      for (let i = 0; i < sig.length; i++) {
        if (sig[i] != null) signal[validStart + i] = sig[i];
      }
    }
    const hist = macd.map((v, i) =>
      (v != null && signal[i] != null) ? v - signal[i] : null
    );
    return { macd, signal, hist };
  }

  class BandaruChart {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.bars = [];
      this.pivots = null;
      this.interval = "5m";
      this.period = "1d";
      this.hover = null;
      this.layout = null;
      // Candle style — "regular", "heikin", or "smooth_heikin"
      // Default to Heikin-Ashi (matches the reference style: continuous color runs)
      this.candleStyle = localStorage.getItem("bandaru_candle_style") || "heikin";
      this._displayCache = null;
      this._displayCacheKey = null;
      // Zoom state — viewStart + viewSlots define the visible window in slot units.
      // viewSlots = null means "fit all" (default — show full reserved width).
      this.viewStart = 0;
      this.viewSlots = null;

      // High-DPI handling
      this.resize();
      this._onResize = () => this.resize();
      window.addEventListener("resize", this._onResize);

      // Pre-create the body-anchored tooltip so it's ready on first move
      this._ensureTooltip();

      // Interactivity — bind once, log so user can verify in DevTools console
      this.canvas.addEventListener("mousemove", (e) => this._onMouseMove(e));
      this.canvas.addEventListener("mouseleave", () => this._onMouseLeave());
      // Wheel zoom — passive:false so we can preventDefault (block page scroll)
      this.canvas.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
      console.log("[BandaruChart] Initialized — canvas:", canvas, "size:", canvas.getBoundingClientRect());
    }

    setData(payload) {
      this.bars = (payload && payload.bars) || [];
      this.pivots = (payload && payload.pivots) || null;
      this.onhl = (payload && payload.onhl) || null;
      this.vc = (payload && payload.vc) || null;
      this.interval = (payload && payload.interval) || this.interval;
      this.period = (payload && payload.period) || this.period;
      this._displayCache = null;
      this.draw();
    }

    setOptionLevels(levels) {
      this.optionLevels = levels || null;
      this.draw();
    }

    setCandleStyle(style) {
      if (!["regular", "heikin", "smooth_heikin"].includes(style)) return;
      this.candleStyle = style;
      try { localStorage.setItem("bandaru_candle_style", style); } catch (e) {}
      this._displayCache = null;
      this.draw();
    }

    _displayBars() {
      if (this.candleStyle === "regular") return this.bars;
      const key = (this.candleStyle + "_") +
        (this.bars.length && this.bars[0].t + "_" + this.bars[this.bars.length - 1].t);
      if (this._displayCache && this._displayCacheKey === key) return this._displayCache;
      if (this.candleStyle === "heikin") {
        this._displayCache = computeHeikinAshi(this.bars);
      } else if (this.candleStyle === "smooth_heikin") {
        this._displayCache = computeSmoothHeikinAshi(this.bars, 10, 10);
      } else {
        this._displayCache = this.bars;
      }
      this._displayCacheKey = key;
      return this._displayCache;
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(2, Math.floor(rect.width * dpr));
      this.canvas.height = Math.max(2, Math.floor(rect.height * dpr));
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
      this.w = rect.width;
      this.h = rect.height;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      if (this.bars.length) this.draw();
    }

    _computeLayout() {
      const RIGHT = 76;
      const BOTTOM = 28;
      const VOL_H = Math.min(55, Math.max(45, this.h * 0.10));
      const MACD_H = Math.min(90, Math.max(70, this.h * 0.14));
      const TTM_H = Math.min(80, Math.max(60, this.h * 0.12));
      const GAP = 6;
      const priceW = Math.max(50, this.w - RIGHT);
      const priceH = Math.max(80, this.h - BOTTOM - VOL_H - MACD_H - TTM_H - GAP * 3);
      const volY = priceH + GAP;
      const macdY = volY + VOL_H + GAP;
      const ttmY = macdY + MACD_H + GAP;
      return { RIGHT, BOTTOM, VOL_H, MACD_H, TTM_H, GAP, priceW, priceH, volY, macdY, ttmY };
    }

    _priceRange() {
      let lo = Infinity, hi = -Infinity, vMax = 0;
      const series = this._displayBars();
      for (const b of series) {
        if (b.l < lo) lo = b.l;
        if (b.h > hi) hi = b.h;
        if (b.v > vMax) vMax = b.v;
      }
      if (this.pivots) {
        for (const k of Object.keys(this.pivots)) {
          const v = this.pivots[k];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (this.onhl) {
        if (this.onhl.high != null && this.onhl.high < lo) lo = this.onhl.high;
        if (this.onhl.high != null && this.onhl.high > hi) hi = this.onhl.high;
        if (this.onhl.low != null && this.onhl.low < lo) lo = this.onhl.low;
        if (this.onhl.low != null && this.onhl.low > hi) hi = this.onhl.low;
      }
      if (this.optionLevels) {
        // Only include option levels that fall reasonably close to the bar range
        // so a deep-OTM huge-OI strike doesn't ruin the y-axis scale.
        const bandLo = lo - (hi - lo) * 0.5;
        const bandHi = hi + (hi - lo) * 0.5;
        for (const k of ["max_pain", "top_call_oi_strike", "top_put_oi_strike"]) {
          const v = this.optionLevels[k];
          if (v != null && isFinite(v) && v >= bandLo && v <= bandHi) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
      if (!isFinite(lo) || !isFinite(hi)) return null;
      // Pad 4% so candles don't touch edges
      const pad = (hi - lo) * 0.04 || 1;
      return { lo: lo - pad, hi: hi + pad, vMax };
    }

    draw() {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      if (!this.bars.length) return;

      this.layout = this._computeLayout();
      const L = this.layout;
      const rng = this._priceRange();
      if (!rng) return;
      const yPrice = (p) => L.priceH * (1 - (p - rng.lo) / (rng.hi - rng.lo));
      // Compute bar width with a sane MAX so candles never balloon into
      // 400px-wide rectangles when only a couple of bars exist after the open.
      // For intraday charts, reserve the FULL trading-day width (≈79 bars at 5m)
      // so early-session bars stay at the left edge and the day "fills in".
      // For 1D + intraday view: reserve space for the FULL trading session
      // (9:30–16:00 ET = 78 5-min bars). This way, early-session bars sit at
      // the left edge and the day visually "fills in" as it progresses.
      const intradayIntervals = { "1m": 390, "2m": 195, "5m": 78, "15m": 26, "30m": 13, "60m": 7, "1h": 7 };
      const isIntraday = !["1d", "1wk", "1mo"].includes(this.interval);
      const sessionBars = intradayIntervals[this.interval];
      let totalSlots = this.bars.length;
      if (isIntraday && sessionBars) {
        if (this.period === "1d") {
          totalSlots = Math.max(sessionBars, this.bars.length);
        } else if (this.period === "2d") {
          totalSlots = Math.max(sessionBars * 2, this.bars.length);
        } else if (this.period === "3d") {
          // Yesterday (real) + Today (real, filling in) + Tomorrow (reserved)
          totalSlots = Math.max(sessionBars * 3, this.bars.length);
        }
      }
      // ZOOM: viewSlots = how many slots are visible (null = fit all).
      // viewStart = leftmost visible slot index. Clamp both to valid range.
      if (this.viewSlots != null) {
        this.viewSlots = Math.min(totalSlots, Math.max(4, this.viewSlots));
        this.viewStart = Math.max(0, Math.min(totalSlots - this.viewSlots, this.viewStart));
      } else {
        this.viewStart = 0;
      }
      const visibleSlots = this.viewSlots || totalSlots;
      const naturalBarW = L.priceW / visibleSlots;
      // Cap is relaxed when zoomed in so candles can be wide & readable.
      const MAX_BAR_W = this.viewSlots != null ? 60 : 18;
      const barW = Math.min(MAX_BAR_W, Math.max(1, naturalBarW));
      const xOffset = 0; // bars pack from left edge
      // Chunkier candle bodies (0.85 of barW) so trend reads clearly even on
      // small-range bars — matches the block-style reference.
      const candleW = Math.max(3, barW * 0.85);
      // x-coord for the centre of slot i — accounts for viewStart shift
      const xBar = (i) => xOffset + (i - this.viewStart) * barW + barW / 2;
      // Save for hover/crosshair which need the same mapping
      this._barW = barW;
      this._xOffset = xOffset;
      this._totalSlots = totalSlots;
      this._visibleSlots = visibleSlots;

      // ----- 3D / 2D session-zone shading + bold partitions + date headers -----
      // Each day gets: distinct background tint, bold vertical separator on
      // both sides, date header strip at the top, and a large label below it.
      // The vertical separators span ALL panes (price, volume, MACD, TTM)
      // so the partition is unmistakable.
      this._dayPartitions = null;  // remember partition x-coords for drawing AFTER all panes
      if (isIntraday && sessionBars && (this.period === "2d" || this.period === "3d")) {
        const dayCount = this.period === "3d" ? 3 : 2;
        const dayLabels = this.period === "3d"
          ? ["YESTERDAY", "TODAY", "TOMORROW"]
          : ["YESTERDAY", "TODAY"];
        // Stronger alternating tints (much more visible than before)
        const dayTints = this.period === "3d"
          ? ["rgba(151,161,171,0.10)", "rgba(88,166,255,0.12)", "rgba(151,161,171,0.06)"]
          : ["rgba(151,161,171,0.10)", "rgba(88,166,255,0.12)"];
        const dayHeaderTints = this.period === "3d"
          ? ["#1c232c", "#1a2a3e", "#161b22"]
          : ["#1c232c", "#1a2a3e"];

        // Compute the actual date for each section (real for past/today, projected for tomorrow)
        const sectionDates = [];
        if (this.bars.length > 0) {
          // First day in bars is "yesterday" (we trim to last 2 trading days)
          const firstDate = new Date(this.bars[0].t);
          firstDate.setHours(0, 0, 0, 0);
          sectionDates.push(new Date(firstDate));
          if (dayCount >= 2) {
            // Find first bar whose date differs — that's "today"
            let todayBar = null;
            for (const b of this.bars) {
              if (new Date(b.t).toDateString() !== firstDate.toDateString()) {
                todayBar = b;
                break;
              }
            }
            const today = todayBar ? new Date(todayBar.t) : new Date(firstDate.getTime() + 24 * 3600 * 1000);
            today.setHours(0, 0, 0, 0);
            sectionDates.push(today);
            if (dayCount >= 3) {
              // Tomorrow = today + 1 day (skip weekend)
              const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
              if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);  // Sat → Mon
              else if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);  // Sun → Mon
              sectionDates.push(tomorrow);
            }
          }
        }

        const HEADER_H = 22;  // height of the date header strip
        const partitionXs = [];

        for (let d = 0; d < dayCount; d++) {
          // x range for this day section — accounts for current zoom (viewStart)
          const x0 = xBar(d * sessionBars) - barW / 2;
          const xW = sessionBars * barW;
          // Section background tint
          c.fillStyle = dayTints[d];
          c.fillRect(x0, HEADER_H, xW, L.priceH - HEADER_H);
          // Date header strip — darker bar at top
          c.fillStyle = dayHeaderTints[d];
          c.fillRect(x0, 0, xW, HEADER_H);
          // Date text — real date for each section
          const dateLabel = sectionDates[d]
            ? sectionDates[d].toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
            : dayLabels[d];
          c.fillStyle = d === 1 ? "#58a6ff" : "#97a1ab";
          c.font = "bold 11px -apple-system, sans-serif";
          c.textAlign = "center";
          c.fillText(dateLabel, x0 + xW / 2, 10);
          // "YESTERDAY / TODAY / TOMORROW" tag below the date
          c.fillStyle = d === 1 ? "rgba(88,166,255,0.85)" : "rgba(151,161,171,0.7)";
          c.font = "bold 9px -apple-system, sans-serif";
          c.fillText(dayLabels[d], x0 + xW / 2, 20);
          // Track partition x-coords (right edge of each section, except the last)
          if (d < dayCount - 1) partitionXs.push(x0 + xW);
        }

        // Bold left/right outer borders — use xBar-aware coords
        partitionXs.push(xBar(0) - barW / 2);  // left edge
        partitionXs.push(xBar(dayCount * sessionBars) - barW / 2);  // right edge
        // Only keep partitions that fall in the visible price area [0, priceW]
        const filtered = partitionXs.filter((x) => x >= -0.5 && x <= L.priceW + 0.5);
        this._dayPartitions = { xs: filtered, headerH: HEADER_H };

        // Header strip bottom border
        c.strokeStyle = "rgba(151,161,171,0.5)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, HEADER_H);
        c.lineTo(L.priceW, HEADER_H);
        c.stroke();
      }

      // ----- Grid lines + price labels (right axis) -----
      c.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      c.fillStyle = COLORS.axis;
      c.strokeStyle = COLORS.grid;
      c.lineWidth = 1;
      const numGrid = 6;
      for (let i = 0; i <= numGrid; i++) {
        const y = (L.priceH / numGrid) * i;
        const p = rng.hi - ((rng.hi - rng.lo) / numGrid) * i;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(L.priceW, y);
        c.stroke();
        c.textAlign = "left";
        c.fillText(p.toFixed(2), L.priceW + 6, y + 4);
      }

      // ----- Pivot S/R lines + right-side labels -----
      if (this.pivots) {
        for (const [k, v] of Object.entries(this.pivots)) {
          const y = yPrice(v);
          if (y < -2 || y > L.priceH + 2) continue;
          const isPP = k === "PP";
          const isR = k.startsWith("R");
          const color = isPP ? COLORS.pivotPP : isR ? COLORS.pivotR : COLORS.pivotS;
          c.strokeStyle = color;
          c.setLineDash([2, 4]);   // all pivot lines dotted now (PP white-dotted, R red-dotted, S green-dotted)
          c.lineWidth = isPP ? 2 : 1.4;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(L.priceW, y);
          c.stroke();
          // Right-side label chip
          c.setLineDash([]);
          const label = `${k} ${v.toFixed(2)}`;
          c.font = "bold 11px -apple-system, sans-serif";
          const labelW = c.measureText(label).width + 10;
          c.fillStyle = color;
          c.fillRect(L.priceW + 2, y - 9, labelW, 18);
          c.fillStyle = isPP ? "#000" : "#fff";
          c.fillText(label, L.priceW + 7, y + 4);
          c.font = "11px -apple-system, sans-serif";
        }
      }

      // (The inline date-change separator was replaced by the bold day
      // partitions drawn after all panes — see _dayPartitions logic below.)

      // ----- Candles + Wicks (modern style: both bodies filled, like investing.com / TradingView) -----
      // Use display bars (real OHLC by default, Heikin-Ashi when toggled)
      // Clip everything from here until just before the time axis so zoomed
      // bars / EMAs / volume / MACD / TTM never spill into the right-axis chip area.
      c.save();
      c.beginPath();
      // Clip ABOVE the time axis but allow the right-axis chip strip to draw
      // (so ONH/ONL labels still render when bars are zoomed in)
      c.rect(0, 0, this.w, L.ttmY + L.TTM_H);
      c.clip();
      const renderBars = this._displayBars();
      for (let i = 0; i < renderBars.length; i++) {
        // Skip slots outside the current zoom view (small perf win + no off-canvas waste)
        if (this.viewSlots != null && (i < this.viewStart || i >= this.viewStart + this.viewSlots + 1)) continue;
        const b = renderBars[i];
        const cx = xBar(i);
        const yH = yPrice(b.h);
        const yL = yPrice(b.l);
        const yO = yPrice(b.o);
        const yC = yPrice(b.c);
        const isBull = b.c >= b.o;
        const color = isBull ? COLORS.bull : COLORS.bear;

        // Wick — slightly thicker so it's visible against the dark background
        c.strokeStyle = color;
        c.lineWidth = candleW >= 8 ? 1.5 : 1;
        c.beginPath();
        c.moveTo(cx, yH);
        c.lineTo(cx, yL);
        c.stroke();

        // Body — chunky filled block. Enforce a minimum height of ~2.5px so
        // doji bars still show direction at small price ranges (matches the
        // block-style reference). Add a faint inner stroke for crisp edges.
        c.fillStyle = color;
        const bodyTop = Math.min(yO, yC);
        const bodyHeight = Math.max(2.5, Math.abs(yC - yO));
        const bodyX = cx - candleW / 2;
        c.fillRect(bodyX, bodyTop, candleW, bodyHeight);
        // Crisp inset outline — same color, slightly darker via globalAlpha
        if (candleW >= 5) {
          c.globalAlpha = 0.55;
          c.strokeStyle = color;
          c.lineWidth = 1;
          c.strokeRect(bodyX + 0.5, bodyTop + 0.5, candleW - 1, bodyHeight - 1);
          c.globalAlpha = 1;
        }
      }

      // ----- EMA overlays on price pane (8/21/50 — use real closes regardless of style) -----
      const realCloses = this.bars.map((b) => b.c);
      const emas = [
        { p: 8,  color: "#00d4ff",   label: "EMA 8" },   // cyan (matches reference)
        { p: 21, color: "#58a6ff",   label: "EMA 21" },  // blue
        { p: 50, color: "#ff7a8c",   label: "EMA 50" },  // coral (matches reference)
      ];
      c.lineWidth = 1.5;
      c.setLineDash([]);
      for (const e of emas) {
        const series = ema(realCloses, e.p);
        c.strokeStyle = e.color;
        c.beginPath();
        let started = false;
        for (let i = 0; i < series.length; i++) {
          if (series[i] == null) continue;
          const cx = xBar(i);
          const y = yPrice(series[i]);
          if (!started) { c.moveTo(cx, y); started = true; }
          else c.lineTo(cx, y);
        }
        c.stroke();
      }

      // ----- Buy / Sell arrows on EMA(8) crossing EMA(21) -----
      // Green ▲ below the low when EMA8 crosses ABOVE EMA21 (buy signal)
      // Pink ▼ above the high when EMA8 crosses BELOW EMA21 (sell signal)
      const ema8series = ema(realCloses, 8);
      const ema21series = ema(realCloses, 21);
      const arrowSize = Math.max(5, Math.min(9, barW * 0.9));
      const arrowGap = arrowSize * 0.6;
      for (let i = 1; i < this.bars.length; i++) {
        if (ema8series[i - 1] == null || ema21series[i - 1] == null) continue;
        if (ema8series[i] == null || ema21series[i] == null) continue;
        const prevDiff = ema8series[i - 1] - ema21series[i - 1];
        const currDiff = ema8series[i] - ema21series[i];
        const bar = this.bars[i];
        const cx = xBar(i);
        if (prevDiff <= 0 && currDiff > 0) {
          // Bullish crossover → green up-arrow below the bar low
          const y = yPrice(bar.l) + arrowGap;
          c.fillStyle = COLORS.arrowBuy;
          c.beginPath();
          c.moveTo(cx, y);
          c.lineTo(cx - arrowSize / 2, y + arrowSize);
          c.lineTo(cx + arrowSize / 2, y + arrowSize);
          c.closePath();
          c.fill();
        } else if (prevDiff >= 0 && currDiff < 0) {
          // Bearish crossover → pink down-arrow above the bar high
          const y = yPrice(bar.h) - arrowGap;
          c.fillStyle = COLORS.arrowSell;
          c.beginPath();
          c.moveTo(cx, y);
          c.lineTo(cx - arrowSize / 2, y - arrowSize);
          c.lineTo(cx + arrowSize / 2, y - arrowSize);
          c.closePath();
          c.fill();
        }
      }

      // ----- ONH / ONL — premarket range lines (cyan dotted) -----
      if (this.onhl) {
        const drawOnLevel = (val, name) => {
          if (val == null) return;
          const y = yPrice(val);
          if (y < -2 || y > L.priceH + 2) return;
          c.strokeStyle = "#00d4ff";
          c.setLineDash([4, 4]);
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(L.priceW, y);
          c.stroke();
          c.setLineDash([]);
          // Right-side chip
          const label = `${name} ${val.toFixed(2)}`;
          c.font = "bold 11px -apple-system, sans-serif";
          c.fillStyle = "#00d4ff";
          const tw = c.measureText(label).width + 10;
          c.fillStyle = "#0a2a33";
          c.fillRect(L.priceW + 2, y - 9, tw, 18);
          c.strokeStyle = "#00d4ff";
          c.strokeRect(L.priceW + 2, y - 9, tw, 18);
          c.fillStyle = "#00d4ff";
          c.fillText(label, L.priceW + 7, y + 4);
          c.font = "11px -apple-system, sans-serif";
        };
        drawOnLevel(this.onhl.high, "ONH");
        drawOnLevel(this.onhl.low, "ONL");
      }

      // ----- Option-chain key levels (Max Pain, Top OI, Top Volume) -----
      // Drawn as solid horizontal lines with a right-side chip label.
      if (this.optionLevels) {
        const ol = this.optionLevels;
        const drawOptLevel = (val, label, color, dashStyle) => {
          if (val == null || !isFinite(val)) return;
          const y = yPrice(val);
          if (y < -2 || y > L.priceH + 2) return;
          c.strokeStyle = color;
          c.setLineDash(dashStyle);
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(L.priceW, y);
          c.stroke();
          c.setLineDash([]);
          // Right-side chip
          c.font = "bold 10px -apple-system, sans-serif";
          const text = `${label} ${val.toFixed(2)}`;
          const tw = c.measureText(text).width + 10;
          c.fillStyle = "#0d1117";
          c.fillRect(L.priceW + 2, y - 9, tw, 18);
          c.strokeStyle = color;
          c.strokeRect(L.priceW + 2, y - 9, tw, 18);
          c.fillStyle = color;
          c.fillText(text, L.priceW + 7, y + 4);
          c.font = "11px -apple-system, sans-serif";
        };
        // Max Pain — yellow/gold (the magnet)
        drawOptLevel(ol.max_pain, "MaxPain", "#f1c870", [6, 4]);
        // Top Call OI — magenta resistance (heaviest call dealer hedge above)
        drawOptLevel(ol.top_call_oi_strike, "CallOI", "#d2a8ff", [8, 3]);
        // Top Put OI — orange support (heaviest put dealer hedge below)
        drawOptLevel(ol.top_put_oi_strike, "PutOI", "#ffa657", [8, 3]);
        // Top Call Volume today — light magenta (live flow attention)
        drawOptLevel(ol.top_call_vol_strike, "CallVol", "rgba(210,168,255,0.55)", [2, 3]);
        // Top Put Volume today — light orange (live flow attention)
        drawOptLevel(ol.top_put_vol_strike, "PutVol", "rgba(255,166,87,0.55)", [2, 3]);
      }

      // ----- Volume bars -----
      const volScale = (v) => (rng.vMax > 0 ? (v / rng.vMax) * L.VOL_H : 0);
      c.fillStyle = COLORS.muted;
      c.font = "10px -apple-system, sans-serif";
      c.textAlign = "left";
      c.fillText("VOL", 4, L.volY - 4);
      for (let i = 0; i < this.bars.length; i++) {
        const b = this.bars[i];
        const cx = xBar(i);
        const isBull = b.c >= b.o;
        const color = isBull ? COLORS.volBull : COLORS.volBear;
        c.fillStyle = color;
        const vh = volScale(b.v);
        c.fillRect(cx - candleW / 2, L.volY + (L.VOL_H - vh), candleW, vh);
      }

      // ----- MACD pane (12, 26, 9) — uses real closes regardless of candle style -----
      const closes = this.bars.map((b) => b.c);
      const mac = computeMACD(closes);
      const macdY = L.macdY;
      const macdH = L.MACD_H;
      // Vertical centre line of MACD pane = zero
      const zeroY = macdY + macdH / 2;
      // Compute symmetric scale from max abs MACD/signal/hist
      let macdMax = 0;
      for (let i = 0; i < closes.length; i++) {
        if (mac.macd[i] != null) macdMax = Math.max(macdMax, Math.abs(mac.macd[i]));
        if (mac.signal[i] != null) macdMax = Math.max(macdMax, Math.abs(mac.signal[i]));
        if (mac.hist[i] != null) macdMax = Math.max(macdMax, Math.abs(mac.hist[i]));
      }
      if (macdMax === 0) macdMax = 1;
      const macdScale = (v) => zeroY - (v / macdMax) * (macdH / 2 - 4);

      // Pane background subtle separation line
      c.strokeStyle = COLORS.grid;
      c.setLineDash([]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, macdY);
      c.lineTo(L.priceW, macdY);
      c.stroke();
      // Zero baseline
      c.strokeStyle = "rgba(151,161,171,0.4)";
      c.beginPath();
      c.moveTo(0, zeroY);
      c.lineTo(L.priceW, zeroY);
      c.stroke();
      // "MACD (12,26,9)" label
      c.fillStyle = COLORS.muted;
      c.font = "10px -apple-system, sans-serif";
      c.textAlign = "left";
      c.fillText("MACD (12, 26, 9)", 4, macdY + 12);

      // Histogram bars
      for (let i = 0; i < this.bars.length; i++) {
        const h = mac.hist[i];
        if (h == null) continue;
        const cx = xBar(i);
        const y0 = zeroY;
        const y1 = macdScale(h);
        c.fillStyle = h >= 0 ? COLORS.macdHistBull : COLORS.macdHistBear;
        c.fillRect(cx - candleW / 2, Math.min(y0, y1), candleW, Math.abs(y1 - y0));
      }

      // MACD line (blue)
      c.strokeStyle = COLORS.macdLine;
      c.lineWidth = 1.5;
      c.beginPath();
      let started = false;
      for (let i = 0; i < this.bars.length; i++) {
        const v = mac.macd[i];
        if (v == null) continue;
        const cx = xBar(i);
        const y = macdScale(v);
        if (!started) { c.moveTo(cx, y); started = true; }
        else c.lineTo(cx, y);
      }
      c.stroke();

      // Signal line (orange)
      c.strokeStyle = COLORS.macdSignal;
      c.lineWidth = 1.5;
      c.beginPath();
      started = false;
      for (let i = 0; i < this.bars.length; i++) {
        const v = mac.signal[i];
        if (v == null) continue;
        const cx = xBar(i);
        const y = macdScale(v);
        if (!started) { c.moveTo(cx, y); started = true; }
        else c.lineTo(cx, y);
      }
      c.stroke();

      // MACD right-axis values + legend
      const lastIdx = this.bars.length - 1;
      const lastMacd = mac.macd[lastIdx];
      const lastSignal = mac.signal[lastIdx];
      const lastHist = mac.hist[lastIdx];
      c.font = "11px -apple-system, sans-serif";
      c.textAlign = "left";
      if (lastMacd != null) {
        c.fillStyle = COLORS.macdLine;
        c.fillText(`MACD ${lastMacd.toFixed(3)}`, L.priceW + 4, macdY + 14);
      }
      if (lastSignal != null) {
        c.fillStyle = COLORS.macdSignal;
        c.fillText(`Sig ${lastSignal.toFixed(3)}`, L.priceW + 4, macdY + 28);
      }
      if (lastHist != null) {
        c.fillStyle = lastHist >= 0 ? COLORS.bull : COLORS.bear;
        const arrow = lastHist >= 0 ? "▲" : "▼";
        c.fillText(`Hist ${arrow} ${lastHist.toFixed(3)}`, L.priceW + 4, macdY + 42);
      }

      // Save MACD data for tooltip
      this._lastMacd = mac;

      // ----- TTM Squeeze pane (John Carter) -----
      const highs = this.bars.map((b) => b.h);
      const lows = this.bars.map((b) => b.l);
      const ttm = computeTTMSqueeze(highs, lows, closes, 20, 2, 1.5);
      const ttmY = L.ttmY;
      const ttmH = L.TTM_H;
      const ttmZeroY = ttmY + ttmH / 2;
      let ttmMax = 0;
      for (const v of ttm.momentum) {
        if (v != null) ttmMax = Math.max(ttmMax, Math.abs(v));
      }
      if (ttmMax === 0) ttmMax = 1;
      const ttmScale = (v) => ttmZeroY - (v / ttmMax) * (ttmH / 2 - 4);

      // Pane separator
      c.strokeStyle = COLORS.grid;
      c.setLineDash([]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, ttmY);
      c.lineTo(L.priceW, ttmY);
      c.stroke();
      // Zero baseline
      c.strokeStyle = "rgba(151,161,171,0.4)";
      c.beginPath();
      c.moveTo(0, ttmZeroY);
      c.lineTo(L.priceW, ttmZeroY);
      c.stroke();
      // Label
      c.fillStyle = COLORS.muted;
      c.font = "10px -apple-system, sans-serif";
      c.textAlign = "left";
      c.fillText("TTM_Squeeze (CLOSE, 20, 1.5, 2.0, 1.0)", 4, ttmY + 12);

      // 4-color histogram (John Carter convention):
      //   positive & rising  → cyan
      //   positive & falling → blue
      //   negative & rising  → yellow (less-negative direction)
      //   negative & falling → red
      for (let i = 0; i < this.bars.length; i++) {
        const v = ttm.momentum[i];
        if (v == null) continue;
        const prev = i > 0 ? ttm.momentum[i - 1] : v;
        let col;
        if (v >= 0) col = (prev == null || v >= prev) ? "#00d4ff" : "#5894f0";
        else        col = (prev == null || v <= prev) ? "#f85149" : "#d29922";
        const cx = xBar(i);
        const y1 = ttmScale(v);
        c.fillStyle = col;
        c.fillRect(cx - candleW / 2, Math.min(ttmZeroY, y1), candleW, Math.abs(y1 - ttmZeroY));
      }

      // Squeeze dots on zero line (red dot = squeeze on, green dot = released)
      for (let i = 0; i < this.bars.length; i++) {
        if (ttm.inSqueeze[i] == null) continue;
        const cx = xBar(i);
        c.fillStyle = ttm.inSqueeze[i] ? "#f85149" : "#3fb950";
        c.beginPath();
        c.arc(cx, ttmZeroY, 1.6, 0, Math.PI * 2);
        c.fill();
      }

      // Last value on right
      const lastMom = ttm.momentum[this.bars.length - 1];
      if (lastMom != null) {
        c.font = "11px -apple-system, sans-serif";
        c.fillStyle = lastMom >= 0 ? "#00d4ff" : "#f85149";
        c.fillText(lastMom.toFixed(3), L.priceW + 4, ttmY + 14);
      }
      this._lastTtm = ttm;

      // End the pane clip — time axis and partitions need to draw outside it
      c.restore();

      // ----- Time axis -----
      c.fillStyle = COLORS.axis;
      c.font = "10px -apple-system, sans-serif";
      c.textAlign = "center";
      const tickCount = Math.min(8, Math.max(4, Math.floor(this.w / 130)));
      const interval = this.interval;
      // (isIntraday already declared above in the totalSlots block)
      // When intraday and we've reserved space for unfilled bars, distribute
      // ticks across the FULL reserved width — not just up to the last bar.
      const useReservedWidth = isIntraday && ["1d", "2d", "3d"].includes(this.period) && this._totalSlots > this.bars.length;
      for (let i = 0; i < tickCount; i++) {
        let x, label;
        if (useReservedWidth) {
          // Ticks across full reserved range — extrapolate timestamps for empty future slots
          const idx = Math.floor(((this._totalSlots - 1) * i) / Math.max(1, tickCount - 1));
          x = xOffset + idx * barW + barW / 2;
          // Determine timestamp for this slot
          const intervalMins = { "1m": 1, "2m": 2, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1h": 60 }[interval] || 5;
          if (idx < this.bars.length) {
            label = new Date(this.bars[idx].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          } else {
            // Extrapolate forward from last known bar
            const last = this.bars[this.bars.length - 1];
            const stepsAhead = idx - (this.bars.length - 1);
            const t = last.t + stepsAhead * intervalMins * 60_000;
            label = new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
        } else {
          const idx = Math.floor(((this.bars.length - 1) * i) / Math.max(1, tickCount - 1));
          x = xBar(idx);
          const b = this.bars[idx];
          if (!b) continue;
          const d = new Date(b.t);
          label = isIntraday
            ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : d.toLocaleDateString([], { month: "short", day: "numeric" });
        }
        c.fillText(label, x, this.h - 8);
      }

      // ----- Bold day partitions — span ALL panes so the day boundaries are
      // unmistakable across the price chart, volume, MACD, and TTM panes.
      if (this._dayPartitions) {
        const yTop = 0;
        const yBottom = L.ttmY + L.TTM_H;
        c.lineWidth = 2;
        c.setLineDash([]);
        for (const x of this._dayPartitions.xs) {
          // Outer accent — fainter glow, then a crisp inner line for visibility
          c.strokeStyle = "rgba(88,166,255,0.20)";
          c.beginPath();
          c.moveTo(x, yTop);
          c.lineTo(x, yBottom);
          c.lineWidth = 4;
          c.stroke();
          c.strokeStyle = "#58a6ff";
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x, yTop);
          c.lineTo(x, yBottom);
          c.stroke();
        }
        c.lineWidth = 1;
      }

      // ----- "Now" marker — vertical bright line at the last bar so the user can see
      // where today's session has filled in vs the remaining reserved space.
      if (useReservedWidth && this.bars.length > 0) {
        const x = xBar(this.bars.length - 1) + barW / 2;
        c.strokeStyle = "rgba(88,166,255,0.55)";
        c.setLineDash([2, 3]);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, L.ttmY + L.TTM_H);
        c.stroke();
        c.setLineDash([]);
        // "Now" label at top
        c.fillStyle = "#58a6ff";
        c.font = "bold 10px -apple-system, sans-serif";
        c.textAlign = "left";
        c.fillText("NOW →", x + 4, L.priceH - 6);
      }

      // ----- Crosshair + price tag -----
      if (this.hover && this.hover.idx != null) {
        const x = xBar(this.hover.idx);
        const y = this.hover.y;
        c.strokeStyle = COLORS.crosshair;
        c.setLineDash([5, 5]);
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, L.ttmY + L.TTM_H);
        c.stroke();
        if (y != null && y >= 0 && y <= L.priceH) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(L.priceW, y);
          c.stroke();
          // price chip on right
          c.setLineDash([]);
          const yval = rng.hi - ((rng.hi - rng.lo) * y) / L.priceH;
          c.fillStyle = "#1c232c";
          c.fillRect(L.priceW + 2, y - 9, L.RIGHT - 4, 18);
          c.strokeStyle = COLORS.text;
          c.strokeRect(L.priceW + 2, y - 9, L.RIGHT - 4, 18);
          c.fillStyle = COLORS.text;
          c.textAlign = "left";
          c.fillText(yval.toFixed(2), L.priceW + 7, y + 4);
        }
        c.setLineDash([]);
      }
    }

    // ============================================================
    //  CLEAN-ROOM HOVER + TOOLTIP IMPLEMENTATION
    //  Bulletproof: created once, attached to body, never relies on
    //  the DOM being in a specific state.
    // ============================================================

    _ensureTooltip() {
      if (this._tt && document.body.contains(this._tt)) return this._tt;
      // Remove any stale element with this ID
      const stale = document.getElementById("chart-tooltip");
      if (stale) stale.remove();
      // Build fresh
      const tt = document.createElement("div");
      tt.id = "chart-tooltip";
      tt.className = "chart-tooltip";
      tt.style.cssText =
        "position:fixed;pointer-events:none;display:none;" +
        "background:#161b22;border:1px solid #2a313a;border-radius:6px;" +
        "padding:10px 12px;font-size:12px;min-width:220px;" +
        "box-shadow:0 8px 24px rgba(0,0,0,0.7);z-index:99999;" +
        "color:#e6edf3;font-variant-numeric:tabular-nums;" +
        "font-family:-apple-system,BlinkMacSystemFont,sans-serif;";
      document.body.appendChild(tt);
      this._tt = tt;
      return tt;
    }

    _onMouseMove(e) {
      if (!this._loggedFirstMove) {
        console.log("[BandaruChart] First mousemove received — hover active");
        this._loggedFirstMove = true;
      }
      if (!this.bars.length) return;
      // If layout hasn't been computed (chart hasn't drawn yet), force a draw
      if (!this.layout) {
        this.draw();
        if (!this.layout) return;
      }
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Clamp x so hover works edge-to-edge — no right-axis dead zone
      const inChartX = Math.max(0, Math.min(this.layout.priceW - 1, x));
      // Use the SAME barW/xOffset/viewStart as draw() so hover lines up with candles
      const barW = this._barW || (this.layout.priceW / this.bars.length);
      const xOff = this._xOffset || 0;
      const vStart = this.viewStart || 0;
      let idx = vStart + Math.floor((inChartX - xOff) / barW);
      if (idx < 0) idx = 0;
      if (idx >= this.bars.length) idx = this.bars.length - 1;

      this.hover = { idx, x: inChartX, y };
      this.draw();
      this._showTooltip(idx, e.clientX, e.clientY);
    }

    _onMouseLeave() {
      this.hover = null;
      this.draw();
      this._hideTooltip();
    }

    // ============================================================
    //  ZOOM — viewStart + viewSlots define the visible window
    //  in slot units (matches the totalSlots reservation).
    // ============================================================

    _fullSlots() {
      // Mirrors the totalSlots calculation in draw() so zoom math stays in sync.
      const intradayIntervals = { "1m": 390, "2m": 195, "5m": 78, "15m": 26, "30m": 13, "60m": 7, "1h": 7 };
      const sessionBars = intradayIntervals[this.interval];
      const isIntraday = !["1d", "1wk", "1mo"].includes(this.interval);
      if (isIntraday && sessionBars) {
        if (this.period === "1d") return Math.max(sessionBars, this.bars.length);
        if (this.period === "2d") return Math.max(sessionBars * 2, this.bars.length);
        if (this.period === "3d") return Math.max(sessionBars * 3, this.bars.length);
      }
      return this.bars.length || 1;
    }

    zoomBy(factor, centerSlot = null) {
      // factor < 1 zooms in (fewer slots visible), > 1 zooms out
      const total = this._fullSlots();
      const currentSlots = this.viewSlots || total;
      let newSlots = Math.max(4, Math.round(currentSlots * factor));
      newSlots = Math.min(total, newSlots);
      if (centerSlot == null) centerSlot = this.viewStart + currentSlots / 2;
      // Anchor the center point in place during zoom
      let newStart = Math.round(centerSlot - newSlots * (centerSlot - this.viewStart) / currentSlots);
      newStart = Math.max(0, Math.min(total - newSlots, newStart));
      this.viewStart = newStart;
      this.viewSlots = newSlots >= total ? null : newSlots;
      this.draw();
    }

    zoomReset() {
      this.viewStart = 0;
      this.viewSlots = null;
      this.draw();
    }

    _onWheel(e) {
      // Only handle vertical scroll
      if (!this.bars.length) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Map cursor x → slot index (in current view)
      const currentSlots = this.viewSlots || this._fullSlots();
      const slotAtCursor = this.viewStart + (x / Math.max(1, this.layout ? this.layout.priceW : rect.width)) * currentSlots;
      // Wheel up (deltaY < 0) → zoom IN (smaller factor); wheel down → zoom OUT
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      this.zoomBy(factor, slotAtCursor);
    }

    _showTooltip(idx, mx, my) {
      const tt = this._ensureTooltip();
      const series = this._displayBars();
      const b = series[idx];
      const realB = this.bars[idx];
      if (!b || !realB) {
        this._hideTooltip();
        return;
      }
      const d = new Date(b.t);
      const dateStr = d.toLocaleString([], {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const isBull = b.c >= b.o;
      const arrow = isBull ? "▲" : "▼";
      const color = isBull ? "#3fb950" : "#f85149";
      const chg = b.c - b.o;
      const chgPct = b.o ? (chg / b.o) * 100 : 0;
      const range = b.h - b.l;

      tt.innerHTML = `
        <div style="color:#97a1ab;font-size:11px;margin-bottom:6px">${dateStr}</div>
        <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 10px;align-items:baseline">
          <span style="color:#97a1ab;font-size:10px">O</span><span style="font-weight:600;text-align:right">${b.o.toFixed(2)}</span>
          <span style="color:#97a1ab;font-size:10px">H</span><span style="font-weight:600;text-align:right">${b.h.toFixed(2)}</span>
          <span style="color:#97a1ab;font-size:10px">L</span><span style="font-weight:600;text-align:right">${b.l.toFixed(2)}</span>
          <span style="color:#97a1ab;font-size:10px">C</span><span style="font-weight:600;text-align:right;color:${color}">${arrow} ${b.c.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid #2a313a;font-size:11px">
          <span style="color:${color};font-weight:600">${chg >= 0 ? "+" : ""}${chg.toFixed(2)} (${chgPct.toFixed(2)}%)</span>
          <span style="color:#97a1ab">Range ${range.toFixed(2)}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#97a1ab">
          Vol ${(realB.v || 0).toLocaleString()}
        </div>
      `;

      // Make visible THEN measure THEN position — no flicker, accurate dims
      tt.style.display = "block";
      tt.style.left = "0px";
      tt.style.top = "0px";
      const w = tt.offsetWidth;
      const h = tt.offsetHeight;
      let left = mx + 16;
      let top = my - 12;
      if (left + w > window.innerWidth - 8) left = mx - w - 16;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      tt.style.left = left + "px";
      tt.style.top = top + "px";
    }

    _hideTooltip() {
      if (this._tt) this._tt.style.display = "none";
    }
  }

  // ---------- Public driver ----------
  let chart = null;
  let currentInterval = "5m";
  let currentPeriod = "3d";  // default: yesterday + today + tomorrow's reserved space
  let refreshTimer = null;

  function getTicker() {
    return (localStorage.getItem("bandaru_active_ticker") || "SPY").toUpperCase();
  }

  async function loadAndRender() {
    const canvas = document.getElementById("bandaru-chart");
    if (!canvas) return;
    if (!chart) chart = new BandaruChart(canvas);
    const ticker = getTicker();
    const url = `/api/candles?ticker=${encodeURIComponent(ticker)}&interval=${currentInterval}&period=${currentPeriod}`;
    try {
      const r = await fetch(url);
      const data = await r.json();
      const sym = document.getElementById("chart-symbol-label");
      if (sym) sym.textContent = data.ticker || ticker;
      const empty = document.getElementById("chart-empty");
      if (!data.bars || !data.bars.length) {
        chart.setData({ bars: [], pivots: null });
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      // Limited-data banner — only relevant when we asked for today only
      const isIntraday = !["1d", "1wk", "1mo"].includes(currentInterval);
      const fewBars = isIntraday && currentPeriod === "1d" && data.bars.length < 20;
      // Suppress the banner on 2D/3D since "few bars" is expected (today is partial)
      void fewBars; // referenced just below — keep linter happy
      const bannerEl = document.getElementById("chart-limited-banner");
      if (bannerEl) {
        if (fewBars) {
          bannerEl.hidden = false;
          bannerEl.textContent = `Only ${data.bars.length} bar${data.bars.length === 1 ? "" : "s"} so far today — switch to 5D for more history`;
        } else {
          bannerEl.hidden = true;
        }
      }
      chart.setData(data);
      // Update header price chips with the latest bar
      const last = data.bars[data.bars.length - 1];
      const first = data.bars[0];
      const lp = document.getElementById("chart-last-price");
      const lc = document.getElementById("chart-last-change");
      if (lp) lp.textContent = "$" + last.c.toFixed(2);
      if (lc) {
        const chg = last.c - first.o;
        const pct = (chg / first.o) * 100;
        const cls = chg >= 0 ? "bull" : "bear";
        const arrow = chg >= 0 ? "▲" : "▼";
        lc.className = cls;
        lc.textContent = `${arrow} ${chg >= 0 ? "+" : ""}${chg.toFixed(2)} (${pct.toFixed(2)}%)`;
      }
      // VC: Volume Confirmation badge
      const vcEl = document.getElementById("chart-vc-badge");
      if (vcEl) {
        if (data.vc && data.vc.signal) {
          vcEl.hidden = false;
          vcEl.className = `vc-badge ${data.vc.signal}`;
          vcEl.textContent = `VC: ${data.vc.signal.toUpperCase()} VOLUME (${data.vc.ratio}× avg)`;
        } else {
          vcEl.hidden = true;
        }
      }
      // ONH / ONL inline summary
      const onhlEl = document.getElementById("chart-onhl-label");
      if (onhlEl) {
        if (data.onhl && (data.onhl.high || data.onhl.low)) {
          const h = data.onhl.high != null ? `ONH ${data.onhl.high}` : "";
          const l = data.onhl.low != null ? `ONL ${data.onhl.low}` : "";
          onhlEl.textContent = [h, l].filter(Boolean).join(" · ");
        } else {
          onhlEl.textContent = "";
        }
      }
    } catch (e) {
      console.warn("chart fetch failed", e);
    }
  }

  function wireControls() {
    const ints = document.getElementById("chart-intervals");
    const pers = document.getElementById("chart-periods");
    if (ints) ints.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-interval]");
      if (!btn) return;
      currentInterval = btn.dataset.interval;
      ints.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      loadAndRender();
    });
    if (pers) pers.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      currentPeriod = btn.dataset.period;
      pers.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      // Reset zoom so user sees the full new period
      if (chart) chart.zoomReset();
      loadAndRender();
    });
    const ref = document.getElementById("chart-refresh");
    if (ref) ref.addEventListener("click", loadAndRender);
    // Zoom controls
    const zIn = document.getElementById("zoom-in");
    const zOut = document.getElementById("zoom-out");
    const zRes = document.getElementById("zoom-reset");
    if (zIn) zIn.addEventListener("click", () => { if (chart) chart.zoomBy(0.7); });
    if (zOut) zOut.addEventListener("click", () => { if (chart) chart.zoomBy(1.5); });
    if (zRes) zRes.addEventListener("click", () => { if (chart) chart.zoomReset(); });
    const sty = document.getElementById("chart-style");
    if (sty) {
      // On boot, sync the visible "active" button with persisted style
      const saved = localStorage.getItem("bandaru_candle_style") || "regular";
      sty.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.dataset.style === saved);
      });
      sty.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-style]");
        if (!btn) return;
        sty.querySelectorAll("button").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        if (chart) chart.setCandleStyle(btn.dataset.style);
      });
    }
  }

  // Auto-refresh — interval is configurable via setRefreshInterval (driven
  // by app.js's dropdown). Default is whatever app.js syncs it to on boot.
  let currentRefreshMs = 10000;
  function scheduleRefresh(ms) {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (ms && ms > 0) currentRefreshMs = ms;
    if (currentRefreshMs > 0) {
      refreshTimer = setInterval(loadAndRender, currentRefreshMs);
    }
  }

  // Public API for other JS (app.js) to trigger a reload on ticker change
  window.BandaruChart = {
    reload: loadAndRender,
    setSymbol: (t) => {
      // Active ticker is already in localStorage by setActiveTicker
      loadAndRender();
    },
    setOptionLevels: (levels) => {
      if (chart) chart.setOptionLevels(levels);
    },
    setRefreshInterval: (ms) => {
      // ms = 0 pauses the chart timer; positive value reschedules
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      currentRefreshMs = Math.max(0, ms | 0);
      if (currentRefreshMs > 0) {
        refreshTimer = setInterval(loadAndRender, currentRefreshMs);
      }
    },
  };

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    wireControls();
    loadAndRender();
    scheduleRefresh();
  });
})();
