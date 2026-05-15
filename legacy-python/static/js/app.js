const $ = (id) => document.getElementById(id);
let lastAnalysis = null;
let lastChain = null;
let refreshTimer = null;
let seenAlerts = new Set();
let alertsArmed = false;  // becomes true after first fetch so we don't blast on page load

// ---------- Active ticker (works for any stock/index) ----------
const TICKER_KEY = "bandaru_active_ticker";
let activeTicker = localStorage.getItem(TICKER_KEY) || "SPY";
function setActiveTicker(t) {
  t = (t || "").toUpperCase().trim();
  if (!t || !/^[\^A-Z0-9._-]{1,10}$/.test(t)) return;
  activeTicker = t;
  localStorage.setItem(TICKER_KEY, t);
  const el = document.getElementById("active-ticker");
  if (el) el.textContent = t;
  const input = document.getElementById("ticker-input");
  if (input) input.value = t;
  document.title = `${t} — Bandaru Trade Analysis`;
  // Re-arm alerts so we don't blast on first fetch of new ticker
  alertsArmed = false;
  seenAlerts = new Set();
  // Refresh all data
  fetchAnalysis();
  fetchChain();
  // Reload TradingView chart with new symbol
  reloadChartWithSymbol(t);
}

// Shared TradingView studies overrides — keeps S/R lines color-coded across reloads.
const TV_STUDIES_OVERRIDES = {
  "Pivot Points Standard.show prices": true,
  "Pivot Points Standard.show labels": true,
  "Pivot Points Standard.P.color":   "#ffffff",
  "Pivot Points Standard.P.linestyle":  0,
  "Pivot Points Standard.P.linewidth":  2,
  "Pivot Points Standard.S1.color":  "#3fb950",
  "Pivot Points Standard.S1.linestyle": 1,
  "Pivot Points Standard.S1.linewidth": 2,
  "Pivot Points Standard.S2.color":  "#3fb950",
  "Pivot Points Standard.S2.linestyle": 1,
  "Pivot Points Standard.S2.linewidth": 2,
  "Pivot Points Standard.S3.color":  "#3fb950",
  "Pivot Points Standard.S3.linestyle": 1,
  "Pivot Points Standard.S3.linewidth": 1,
  "Pivot Points Standard.R1.color":  "#f85149",
  "Pivot Points Standard.R1.linestyle": 1,
  "Pivot Points Standard.R1.linewidth": 2,
  "Pivot Points Standard.R2.color":  "#f85149",
  "Pivot Points Standard.R2.linestyle": 1,
  "Pivot Points Standard.R2.linewidth": 2,
  "Pivot Points Standard.R3.color":  "#f85149",
  "Pivot Points Standard.R3.linestyle": 1,
  "Pivot Points Standard.R3.linewidth": 1,
};

function reloadChartWithSymbol(sym) {
  // Native chart driver — fetches /api/candles with the current ticker
  if (window.BandaruChart && typeof window.BandaruChart.reload === "function") {
    window.BandaruChart.reload();
    return;
  }
  // No-op if chart not loaded yet
  return;
}

// Legacy TradingView reload — kept for reference but unused
function _unused_tvReload(sym) {
  const container = document.getElementById("tradingview_chart");
  if (!container || !window.TradingView) return;
  container.innerHTML = "";
  try {
    new TradingView.widget({
      "autosize": true,
      "symbol": sym.startsWith("^") ? sym : sym,  // TV resolves AMEX:SPY etc on its own
      "interval": "5",
      "timezone": "America/New_York",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "#161b22",
      "hide_top_toolbar": false,
      "hide_legend": false,
      "withdateranges": true,
      "details": true,
      "allow_symbol_change": true,
      "studies": [
        "PivotPointsStandard@tv-basicstudies",
        "VWAP@tv-basicstudies",
        "MACD@tv-basicstudies"
      ],
      "studies_overrides": TV_STUDIES_OVERRIDES,
      "container_id": "tradingview_chart"
    });
  } catch (e) { console.warn(e); }
}

function tickerQS() {
  return `?ticker=${encodeURIComponent(activeTicker)}`;
}

// ---------- Alerts: desktop notifications + sound chime ----------
function alertKey(r) {
  // Include status — the same setup flipping STANDBY→GO is a NEW alert
  return [r.id, r.type, r.strike, r.entry_spy_price, r.status || "STANDBY"].join("|");
}

function loadSeen() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem("spy_seen_alerts");
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    // Reset the set at the start of each day
    if (parsed.date !== today) return new Set();
    return new Set(parsed.keys || []);
  } catch (e) {
    return new Set();
  }
}

function persistSeen() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(
      "spy_seen_alerts",
      JSON.stringify({ date: today, keys: [...seenAlerts] })
    );
  } catch (e) {}
}

function alertsEnabled() {
  return $("alerts").checked && Notification.permission === "granted";
}

function playChime(direction) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Bullish = ascending two-tone; Bearish = descending
    if (direction === "bearish") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);
    }
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    /* audio not allowed yet — user has to click once */
  }
}

function fireAlert(r) {
  const arrow = r.direction === "bullish" ? "▲" : "▼";
  const title = `🟢 GO ${arrow} ${r.strategy}`;
  const body = `ENTRY NOW: ${r.type} $${r.strike} @ $${r.current_premium}\nTarget ${r.profit_target_spy} · Stop ${r.stop_loss_spy}\n${r.validity_note || ""}`;
  try {
    new Notification(title, {
      body,
      tag: alertKey(r),
      requireInteraction: true,  // GO alerts are important — sticky until user clicks
      silent: true,
    });
  } catch (e) {}
  playChime(r.direction);
}

function processAlerts(recs) {
  if (!Array.isArray(recs)) return;
  const currentKeys = new Set(recs.map(alertKey));
  if (alertsArmed && alertsEnabled()) {
    for (const r of recs) {
      // Only fire on GO state — that's the actionable transition
      if (r.status !== "GO") continue;
      const k = alertKey(r);
      if (!seenAlerts.has(k)) {
        fireAlert(r);
        seenAlerts.add(k);
      }
    }
    // Garbage-collect keys for setups no longer present
    for (const k of [...seenAlerts]) {
      if (!currentKeys.has(k)) seenAlerts.delete(k);
    }
    persistSeen();
  } else {
    // First fetch — seed all current keys so we don't blast on page load
    for (const r of recs) seenAlerts.add(alertKey(r));
    persistSeen();
  }
  alertsArmed = true;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}
const fmt = (v, d = 2) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));
const fmtPct = (v) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(2) + "%");
const fmtInt = (v) => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString());

async function fetchAnalysis() {
  try {
    const r = await fetch("/api/analysis" + tickerQS());
    const data = await r.json();
    if (!r.ok) { renderError(data.error || "Request failed"); return; }
    lastAnalysis = data;
    renderAnalysis(data);
  } catch (e) { renderError(e.message); }
}
// ---------- Watchlist customization (persisted) ----------
const WATCHLIST_KEY = "bandaru_watchlist_symbols";
const DEFAULT_WATCHLIST = [
  "SPY", "QQQ", "IWM", "DIA",
  "^VIX", "VXX",
  "NVDA", "AAPL", "MSFT", "GOOGL", "META", "TSLA", "AMZN", "AMD",
];

function loadWatchlistSymbols() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return DEFAULT_WATCHLIST.slice();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_WATCHLIST.slice();
  } catch (e) {
    return DEFAULT_WATCHLIST.slice();
  }
}

function saveWatchlistSymbols(symbols) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols)); }
  catch (e) {}
}

function addWatchlistSymbol(sym) {
  sym = (sym || "").toUpperCase().trim();
  if (!sym || !/^[\^A-Z0-9._-]{1,10}$/.test(sym)) {
    alert("Invalid symbol. Examples: NFLX, ^DJI, BTC-USD");
    return false;
  }
  const list = loadWatchlistSymbols();
  if (list.includes(sym)) {
    alert(`${sym} is already in your watchlist.`);
    return false;
  }
  if (list.length >= 30) {
    alert("Watchlist is capped at 30 symbols. Remove some before adding more.");
    return false;
  }
  list.push(sym);
  saveWatchlistSymbols(list);
  return true;
}

function removeWatchlistSymbol(sym) {
  const list = loadWatchlistSymbols().filter((s) => s !== sym);
  saveWatchlistSymbols(list);
}

function resetWatchlist() {
  if (!confirm("Reset watchlist to the default 14 symbols?")) return;
  localStorage.removeItem(WATCHLIST_KEY);
}

async function fetchWatchlist() {
  try {
    const syms = loadWatchlistSymbols().join(",");
    const url = "/api/watchlist" + (syms ? `?symbols=${encodeURIComponent(syms)}` : "");
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return;
    renderWatchlist(data);
  } catch (e) {}
}

function renderWatchlist(data) {
  const host = $("watchlist-grid");
  if (!host) return;
  if (!data || data.error || !data.symbols) {
    host.innerHTML = `<div class="empty">Watchlist unavailable: ${data && data.error ? data.error : 'no data'}</div>`;
    return;
  }
  const groups = {};
  for (const s of data.symbols) {
    const g = s.group || "Other";
    (groups[g] = groups[g] || []).push(s);
  }
  let html = "";
  for (const [groupName, symbols] of Object.entries(groups)) {
    html += `<div class="wl-group-label">${groupName}</div><div class="wl-group">`;
    for (const s of symbols) {
      const dirCls = s.direction === "up" ? "up" : s.direction === "down" ? "down" : "";
      const arrow = s.direction === "up" ? "▲" : s.direction === "down" ? "▼" : "—";
      const price = s.price != null ? "$" + fmt(s.price) : "—";
      const chg = s.change != null ? (s.change >= 0 ? "+" : "") + fmt(s.change) : "—";
      const pct = s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${s.change_pct}%` : "—";
      const range = (s.day_low != null && s.day_high != null)
        ? `${fmt(s.day_low)} – ${fmt(s.day_high)}`
        : "";
      html += `
        <div class="wl-tile ${dirCls}" data-symbol="${s.symbol}">
          <button class="wl-remove" data-symbol="${s.symbol}" title="Remove from watchlist">✕</button>
          <div class="wl-top">
            <span class="wl-symbol">${s.symbol}</span>
            <span class="wl-name">${s.name || ""}</span>
          </div>
          <div class="wl-price">${price}</div>
          <div class="wl-chg ${dirCls}">${arrow} ${chg}  <span class="wl-pct">${pct}</span></div>
          ${range ? `<div class="wl-range">Day: ${range}</div>` : ""}
        </div>`;
    }
    html += `</div>`;
  }
  host.innerHTML = html;

  // Make each tile clickable — sets the active ticker for the whole dashboard
  document.querySelectorAll(".wl-tile").forEach((tile) => {
    tile.addEventListener("click", (e) => {
      if (e.target.closest(".wl-remove")) return;  // X button handles itself
      const sym = tile.dataset.symbol;
      setActiveTicker(sym);
      switchTab("chart");
    });
  });
  // X button — remove a symbol from the watchlist
  document.querySelectorAll(".wl-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sym = btn.dataset.symbol;
      removeWatchlistSymbol(sym);
      fetchWatchlist();
    });
  });
}

async function fetchChain() {
  try {
    const r = await fetch("/api/chain" + tickerQS());
    const data = await r.json();
    if (!r.ok) return;
    lastChain = data;
    renderChain(data);
    renderJournal();  // refresh P&L numbers with new marks
  } catch (e) {}
}
function renderError(msg) {
  let host = document.querySelector(".error");
  if (!host) {
    host = document.createElement("div");
    host.className = "error";
    document.body.insertBefore(host, document.querySelector("main"));
  }
  host.textContent = "Error: " + msg;
}
function renderAnalysis(d) {
  const err = document.querySelector(".error");
  if (err) err.remove();
  // Defensive sync — what the server actually computed for this request
  if (d.ticker) {
    const el = $("active-ticker");
    if (el) el.textContent = d.ticker;
    document.title = `${d.ticker} — Bandaru Trade Analysis`;
  }
  // Data-source banner
  const src = d.data_source || (d.demo ? "demo" : "schwab");
  let b = document.querySelector(".demo-banner");
  if (src !== "schwab") {
    if (!b) {
      b = document.createElement("div");
      b.className = "demo-banner";
      document.body.insertBefore(b, document.querySelector("header"));
    }
    if (src === "demo") {
      b.textContent = "DEMO MODE — synthetic data, not real markets";
    } else if (src === "yahoo") {
      b.textContent = "LIVE (Yahoo Finance) — ~15-min delayed during market hours";
    } else if (src.startsWith("u")) {
      b.textContent = "LIVE (Unusual Whales) — real-time options + flow data";
    } else if (src.startsWith("t")) {
      b.textContent = "LIVE (TastyTrade) — real-time SPY + options chain";
    } else {
      b.textContent = "LIVE (Schwab) — real-time";
    }
    b.classList.toggle("yahoo", src === "yahoo");
    b.classList.toggle("uw", src.startsWith("u"));
    b.classList.toggle("tasty", src.startsWith("t"));
  } else if (b) {
    b.remove();
  }
  $("price").textContent = "$" + fmt(d.spy.price);
  // Session badge — premarket / regular / afterhours / closed
  const sb = $("session-badge");
  if (sb) {
    const s = d.spy.session || "regular";
    const sd = d.spy.session_data || {};
    sb.className = "session-badge " + s;
    if (s === "premarket" || s === "afterhours") {
      let extra = sd.last_update ? `  · last ${sd.last_update}` : "";
      let hl = (sd.high != null && sd.low != null) ? `  · H ${fmt(sd.high)} L ${fmt(sd.low)}` : "";
      sb.textContent = `${s === "premarket" ? "PRE" : "AH"}${extra}${hl}`;
    } else if (s === "closed") {
      sb.textContent = "CLOSED";
    } else {
      sb.textContent = "RTH";
    }
  }
  const chgEl = $("change");
  const c = d.spy.change ?? 0;
  const cp = d.spy.change_pct ?? 0;
  chgEl.textContent = (c >= 0 ? "+" : "") + fmt(c) + "  (" + fmtPct(cp) + ")";
  chgEl.className = "change " + (c >= 0 ? "up" : "down");
  $("exp").textContent = d.expiration;
  $("ts").textContent = d.timestamp;
  const pd = d.previous_day;
  $("prev").textContent = `Prev day: O ${fmt(pd.open)} · H ${fmt(pd.high)} · L ${fmt(pd.low)} · C ${fmt(pd.close)}`;
  const safeRun = (fn) => { try { fn(); } catch (e) { console.warn("Render error:", e); } };
  safeRun(() => renderMaster(d.indicators));
  // Pivot strip removed from Chart tab to maximize chart space.
  // Pivot values are visible inside the TradingView chart (S/R lines + labels)
  // and on the Pivots panel in the Entry/Exit Alerts tab.
  safeRun(() => renderLevels(d.spy.price, d.pivots));
  safeRun(() => renderStats(d.stats, d.spy));
  safeRun(() => renderIndicators(d.indicators));
  safeRun(() => renderStackedEmas(d.indicators, d.spy.price));
  safeRun(() => renderAdx(d.indicators));
  safeRun(() => renderPro(d.pro, d.spy.price));
  safeRun(() => renderRecs(d.recommendations, d.chain_error, d.chain_count));
  safeRun(() => processAlerts(d.recommendations));
  // Push option-chain levels into the chart for horizontal overlay lines
  safeRun(() => {
    if (window.BandaruChart && d.option_levels) {
      window.BandaruChart.setOptionLevels(d.option_levels);
    }
  });
}

// ---------- Pivot Levels Strip (Chart tab) ----------
function renderPivotStrip(pivots, price) {
  const host = $("pivot-strip");
  if (!host || !pivots) return;
  // Order: R3 (highest resistance) → S3 (deepest support). Always 7 cells when present.
  const order = ["R3", "R2", "R1", "PP", "S1", "S2", "S3"];
  let html = "";
  for (const label of order) {
    const v = pivots[label];
    if (v == null) continue;
    let cls = label === "PP" ? "pp" : (label.startsWith("R") ? "r" : "s");
    let dist = price ? ((v - price) / price * 100) : null;
    let distStr = dist != null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : "—";
    const isNearest =
      (label.startsWith("R") && price && v > price &&
       !order.some(l => l.startsWith("R") && pivots[l] != null && pivots[l] > price && pivots[l] < v)) ||
      (label.startsWith("S") && price && v < price &&
       !order.some(l => l.startsWith("S") && pivots[l] != null && pivots[l] < price && pivots[l] > v));
    if (isNearest) cls += " nearest";
    html += `
      <div class="ps-cell ${cls}">
        <span class="ps-label">${label}</span>
        <span class="ps-value">$${fmt(v)}</span>
        <span class="ps-dist">${distStr}</span>
      </div>`;
  }
  host.innerHTML = html;
}

// ---------- Master Verdict banner (top of page) ----------
function renderMaster(ind) {
  const host = $("master-verdict");
  if (!ind || ind.error || !ind.master) {
    host.innerHTML = '<div class="mv-loading">Indicators loading…</div>';
    return;
  }
  const m = ind.master;
  const verdict = m.verdict || "MIXED";
  const signal = m.signal || "WAIT";
  let cls = "neutral";
  if (verdict.includes("BULLISH")) cls = "bullish";
  else if (verdict.includes("BEARISH")) cls = "bearish";

  let signalCls = "wait";
  if (signal === "GO LONG" || signal === "GO SHORT") signalCls = "go";
  else if (signal === "NO-GO") signalCls = "nogo";

  host.className = "master-verdict " + cls;
  host.innerHTML = `
    <div class="mv-verdict">${verdict}</div>
    <div class="mv-signal ${signalCls}">${signal}</div>
    <div class="mv-factors">${(m.factors || []).join(" · ")}</div>
  `;
}

// ---------- Stacked EMA card ----------
function renderStackedEmas(ind, spyPrice) {
  const host = $("stacked-emas");
  const statusEl = $("stacked-status");
  const s = ind && ind.stacked_emas;
  if (!s || s.d8 == null) {
    host.innerHTML = '<div class="empty">No data</div>';
    statusEl.textContent = "—";
    statusEl.className = "squeeze-status neutral";
    return;
  }
  statusEl.className = "squeeze-status " + (s.verdict === "bullish" ? "fired-bull" : s.verdict === "bearish" ? "fired-bear" : "in-squeeze");
  statusEl.textContent = s.stack;

  const row = (label, value, diff) => {
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "";
    const sub = diff != null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} vs price` : "";
    return `<div class="stat-cell"><span class="k">${label}</span><span class="v ${cls}">$${fmt(value)}</span><span class="sub">${sub}</span></div>`;
  };
  host.innerHTML =
    row("Last Close", s.last_close, null) +
    row("EMA 8", s.d8, s.vs_d8) +
    row("EMA 21", s.d21, s.vs_d21) +
    row("EMA 50", s.d50, s.vs_d50);
}

// ---------- ADX card ----------
// Track last-seen ADX so we can show the delta between refreshes
let _lastAdx = { daily: null, intraday: null };
function _deltaTag(prev, curr) {
  if (prev == null || curr == null) return "";
  const d = curr - prev;
  if (Math.abs(d) < 0.005) return "";  // no visible change
  const cls = d > 0 ? "up" : "down";
  const arrow = d > 0 ? "▲" : "▼";
  const sign = d > 0 ? "+" : "";
  return ` <span class="adx-delta ${cls}">${arrow} ${sign}${d.toFixed(2)}</span>`;
}
function renderAdx(ind) {
  const host = $("adx-grid");
  const statusEl = $("adx-status");
  const a = ind && ind.adx;
  const aIntra = ind && ind.adx_intraday;
  if (!a || a.adx == null) {
    host.innerHTML = '<div class="empty">No data</div>';
    statusEl.textContent = "—";
    statusEl.className = "squeeze-status neutral";
    return;
  }
  statusEl.className = "squeeze-status " + (a.trend === "Bullish" ? "fired-bull" : "fired-bear");
  statusEl.innerHTML = `${a.strength} ${a.trend} Trend  (Daily ADX ${a.adx}${_deltaTag(_lastAdx.daily, a.adx)})`;

  const cell = (k, v, cls, sub) =>
    `<div class="stat-cell"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;

  let html =
    cell("ADX Daily (14)", a.adx + _deltaTag(_lastAdx.daily, a.adx), a.adx >= 25 ? "warn" : "", a.strength) +
    cell("+DI Daily", a.plus_di, "up", "bullish pressure") +
    cell("-DI Daily", a.minus_di, "down", "bearish pressure") +
    cell("Trend Daily", a.trend, a.trend === "Bullish" ? "up" : "down", "from +DI vs -DI");
  // Intraday ADX (5m bars) — much more responsive during the session
  if (aIntra && aIntra.adx != null) {
    html +=
      cell("ADX 5m (14)", aIntra.adx + _deltaTag(_lastAdx.intraday, aIntra.adx),
           aIntra.adx >= 25 ? "warn" : "", aIntra.strength) +
      cell("+DI 5m", aIntra.plus_di, "up", "intraday bull") +
      cell("-DI 5m", aIntra.minus_di, "down", "intraday bear") +
      cell("Trend 5m", aIntra.trend, aIntra.trend === "Bullish" ? "up" : "down", "5-min direction");
  }
  host.innerHTML = html;

  // Persist for next-refresh delta
  _lastAdx.daily = a.adx;
  if (aIntra && aIntra.adx != null) _lastAdx.intraday = aIntra.adx;
}

// ---------- Pro Signals ----------
function renderPro(pro, spyPrice) {
  if (!pro || pro.error) {
    $("squeeze-status").textContent = pro && pro.error ? pro.error : "—";
    return;
  }
  // TTM Squeeze
  const sq = pro.squeeze || {};
  const statusEl = $("squeeze-status");
  statusEl.className = "squeeze-status";
  if (sq.in_squeeze) {
    statusEl.classList.add("in-squeeze");
  } else if (sq.fired === "bullish") {
    statusEl.classList.add("fired-bull");
  } else if (sq.fired === "bearish") {
    statusEl.classList.add("fired-bear");
  } else if (sq.momentum > 0) {
    statusEl.classList.add("fired-bull");
  } else if (sq.momentum < 0) {
    statusEl.classList.add("fired-bear");
  } else {
    statusEl.classList.add("neutral");
  }
  statusEl.textContent = sq.state || "—";

  // Squeeze histogram — TTM color logic: cyan/blue for positive, red/orange for negative
  const hist = sq.history || [];
  const hostHist = $("squeeze-histogram");
  hostHist.innerHTML = "";
  if (!hist.length) {
    hostHist.innerHTML = '<span class="empty">No momentum history</span>';
  } else {
    const max = Math.max(...hist.map(Math.abs)) || 1;
    for (let i = 0; i < hist.length; i++) {
      const v = hist[i];
      const prev = i > 0 ? hist[i - 1] : v;
      let cls = "muted";
      if (v >= 0) cls = v >= prev ? "cyan" : "blue";
      else cls = v <= prev ? "red" : "orange";
      const heightPct = Math.max(2, (Math.abs(v) / max) * 70);
      hostHist.innerHTML += `<div class="sq-bar ${cls}" style="height:${heightPct}px" title="${v}"></div>`;
    }
  }

  // Overnight High / Low
  const on = pro.overnight || {};
  const onCells = [];
  const onCell = (k, v, sub, cls) => {
    onCells.push(`<div class="stat-cell"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`);
  };
  if (on.high) {
    const dh = spyPrice ? (on.high - spyPrice).toFixed(2) : null;
    onCell("ONH", "$" + on.high, dh != null ? `${dh >= 0 ? "+" : ""}${dh} from spot` : "", "down");
  } else {
    onCell("ONH", "—", "");
  }
  if (on.low) {
    const dl = spyPrice ? (on.low - spyPrice).toFixed(2) : null;
    onCell("ONL", "$" + on.low, dl != null ? `${dl >= 0 ? "+" : ""}${dl} from spot` : "", "up");
  } else {
    onCell("ONL", "—", "");
  }
  $("onhl").innerHTML = onCells.join("");

  // Volume Confirmation
  const vc = pro.volume_conf || {};
  const vcEl = $("vc-status");
  vcEl.className = "vc-status";
  if (vc.signal === "bullish") vcEl.classList.add("bullish");
  else if (vc.signal === "bearish") vcEl.classList.add("bearish");
  else vcEl.classList.add("neutral");
  vcEl.textContent = vc.state || "—";

  // Chandelier
  const ch = pro.chandelier || {};
  const chCells = [];
  if (ch.long_stop != null) {
    const dist = spyPrice ? ((spyPrice - ch.long_stop) / spyPrice * 100).toFixed(2) : null;
    chCells.push(`<div class="stat-cell"><span class="k">Long Stop</span><span class="v down">$${fmt(ch.long_stop)}</span><span class="sub">${dist}% below spot</span></div>`);
  }
  if (ch.short_stop != null) {
    const dist = spyPrice ? ((ch.short_stop - spyPrice) / spyPrice * 100).toFixed(2) : null;
    chCells.push(`<div class="stat-cell"><span class="k">Short Stop</span><span class="v up">$${fmt(ch.short_stop)}</span><span class="sub">${dist}% above spot</span></div>`);
  }
  if (ch.atr != null) {
    chCells.push(`<div class="stat-cell"><span class="k">ATR (22)</span><span class="v">$${fmt(ch.atr)}</span></div>`);
  }
  $("chandelier").innerHTML = chCells.join("") || '<div class="empty">No data</div>';
}

// ---------- Stats panel ----------
function renderStats(s, spy) {
  if (!s) return;
  const cells = [];
  const cell = (k, v, opts = {}) => {
    const cls = opts.cls || "";
    const sub = opts.sub ? `<span class="sub">${opts.sub}</span>` : "";
    const help = opts.help ? `<span class="help" title="${opts.help.replace(/"/g, "&quot;")}">?</span>` : "";
    cells.push(`<div class="stat-cell"><span class="k">${k}${help}</span><span class="v ${cls}">${v}</span>${sub}</div>`);
  };
  const arrow = (v) => (v == null ? "" : v >= 0 ? "▲ " : "▼ ");

  // Day position 0-100% (where in today's range)
  const dayPos = s.day_position_pct;
  cell("Day Position", dayPos == null ? "—" : `${dayPos}%`, {
    sub: spy && spy.day_low && spy.day_high
      ? `${fmt(spy.day_low)} → ${fmt(spy.day_high)}`
      : "",
    cls: dayPos == null ? "" : dayPos > 70 ? "warn" : dayPos < 30 ? "warn" : "",
    help: "Where SPY sits within today's range. 0% = day low, 100% = day high. >70% or <30% suggests momentum extreme.",
  });

  // Range vs prev day
  cell("Range vs Prev Day", s.range_expansion == null ? "—" : `${s.range_expansion}x`, {
    sub: s.day_range ? `Today: $${s.day_range}` : "",
    cls: s.range_expansion == null ? "" : s.range_expansion > 1 ? "up" : "down",
    help: "Today's H-L range divided by yesterday's. >1 = volatility expanding, <1 = consolidating.",
  });

  // Distance to nearest resistance / support
  cell("To Resistance", s.dist_to_resistance == null ? "—" :
    `${arrow(s.dist_to_resistance)}$${Math.abs(s.dist_to_resistance).toFixed(2)}`, {
    sub: s.nearest_resistance ? `${s.nearest_resistance} (${s.dist_to_resistance_pct}%)` : "",
    cls: "down",
    help: "Distance to the nearest pivot level above current price.",
  });
  cell("To Support", s.dist_to_support == null ? "—" :
    `${arrow(-s.dist_to_support)}$${Math.abs(s.dist_to_support).toFixed(2)}`, {
    sub: s.nearest_support ? `${s.nearest_support} (${s.dist_to_support_pct}%)` : "",
    cls: "up",
    help: "Distance to the nearest pivot level below current price.",
  });

  // Max pain
  cell("Max Pain", s.max_pain == null ? "—" : `$${fmt(s.max_pain)}`, {
    sub: s.max_pain_distance == null ? "" :
      `${s.max_pain_distance >= 0 ? "+" : ""}${s.max_pain_distance} from spot`,
    cls: "warn",
    help: "Strike that hurts the most option holders if it expires there. 0DTE SPY tends to gravitate toward Max Pain into the close.",
  });

  // Put/Call ratio (volume)
  const pc = s.put_call || {};
  const pcVol = pc.volume_ratio;
  cell("P/C Ratio (Vol)", pcVol == null ? "—" : pcVol, {
    sub: pc.oi_ratio == null ? "" : `OI: ${pc.oi_ratio}`,
    cls: pcVol == null ? "" : pcVol > 1.2 ? "down" : pcVol < 0.8 ? "up" : "",
    help: "Today's put volume / call volume. >1 = bearish skew, <1 = bullish skew. SPY typical: 0.7–1.3.",
  });

  $("stats").innerHTML = cells.join("");
}

// ---------- Technical Indicators ----------
function renderIndicators(ind) {
  const host = $("indicators");
  if (!ind || ind.error) {
    host.innerHTML = `<div class="empty">Indicators unavailable: ${ind && ind.error ? ind.error : 'no data'}</div>`;
    return;
  }
  const t = ind.trailing || {};
  const l = ind.leading || {};
  const close = ind.last_close;
  const above = (a, b) => a != null && b != null ? a > b : null;

  // Trailing (lagging) — MAs, ATR, Bollinger
  const trailing = `
    <div class="ind-group">
      <h4>Trailing (Lagging)</h4>
      <div class="ind-row"><span class="k">EMA 9</span><span class="v ${above(close, t.ema9) ? 'up' : 'down'}">${fmt(t.ema9)}</span></div>
      <div class="ind-row"><span class="k">EMA 20</span><span class="v ${above(close, t.ema20) ? 'up' : 'down'}">${fmt(t.ema20)}</span></div>
      <div class="ind-row"><span class="k">EMA 50</span><span class="v ${above(close, t.ema50) ? 'up' : 'down'}">${fmt(t.ema50)}</span></div>
      <div class="ind-row"><span class="k">SMA 50</span><span class="v ${above(close, t.sma50) ? 'up' : 'down'}">${fmt(t.sma50)}</span></div>
      <div class="ind-row"><span class="k">ATR (14)</span><span class="v">$${fmt(t.atr14)}</span></div>
      <div class="ind-row"><span class="k">BB Width</span><span class="v">${t.bb && t.bb.width_pct != null ? t.bb.width_pct + '%' : '—'}</span></div>
      <div class="ind-row"><span class="k">MA Stack</span><span class="v ${t.ma_trend && t.ma_trend.includes('Up') ? 'up' : (t.ma_trend === 'Down' ? 'down' : 'warn')}">${t.ma_trend || '—'}</span></div>
    </div>`;

  // Leading — RSI, MACD, Stoch
  const rsi = l.rsi14;
  const stochK = l.stoch && l.stoch.k;
  const macd = l.macd || {};
  const leading = `
    <div class="ind-group">
      <h4>Leading (Momentum)</h4>
      <div class="ind-row"><span class="k">RSI (14)</span><span class="v ${rsi == null ? '' : rsi >= 70 ? 'down' : rsi <= 30 ? 'up' : ''}">${fmt(rsi, 1)} <small style="color:var(--muted)">${l.rsi_signal || ''}</small></span></div>
      <div class="ind-meter"><div class="${rsi >= 70 ? 'ob' : rsi <= 30 ? 'os' : ''}" style="width:${rsi || 0}%"></div></div>
      <div class="ind-row"><span class="k">Stoch %K</span><span class="v ${stochK == null ? '' : stochK >= 80 ? 'down' : stochK <= 20 ? 'up' : ''}">${fmt(stochK, 1)} <small style="color:var(--muted)">${l.stoch_signal || ''}</small></span></div>
      <div class="ind-row"><span class="k">Stoch %D</span><span class="v">${fmt(l.stoch && l.stoch.d, 1)}</span></div>
      <div class="ind-row"><span class="k">MACD</span><span class="v">${fmt(macd.macd, 3)}</span></div>
      <div class="ind-row"><span class="k">Signal</span><span class="v">${fmt(macd.signal, 3)}</span></div>
      <div class="ind-row"><span class="k">Histogram</span><span class="v ${macd.hist == null ? '' : macd.hist > 0 ? 'up' : 'down'}">${fmt(macd.hist, 3)} <small style="color:var(--muted)">${macd.trend || ''}</small></span></div>
    </div>`;
  host.innerHTML = trailing + leading;
}
function renderLevels(price, pivots) {
  const entries = Object.entries(pivots).sort((a, b) => b[1] - a[1]);
  const values = entries.map((e) => e[1]).concat([price]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const host = $("levels");
  host.innerHTML = "";
  const merged = [...entries, ["NOW", price]].sort((a, b) => b[1] - a[1]);
  for (const [label, val] of merged) {
    const row = document.createElement("div");
    let cls = "level-row";
    if (label === "NOW") cls += " current";
    else if (label === "PP") cls += " pp";
    else if (label.startsWith("R")) cls += " r";
    else if (label.startsWith("S")) cls += " s";
    row.className = cls;
    const dist = ((val - price) / price) * 100;
    const pct = ((val - lo) / span) * 100;
    row.innerHTML = `
      <div class="label">${label === "NOW" ? "↦" : label}</div>
      <div>${fmt(val)}</div>
      <div class="bar"><div style="width:${pct.toFixed(1)}%"></div></div>
      <div class="distance">${label === "NOW" ? "current" : (dist >= 0 ? "+" : "") + dist.toFixed(2) + "%"}</div>`;
    host.appendChild(row);
  }
}
function renderRecs(recs, chainError, chainCount) {
  const host = $("recs");
  if (!recs || !recs.length) {
    // Distinguish "chain is empty" from "no setups found"
    if (chainError || !chainCount) {
      const msg = chainError
        ? `Options data unavailable: ${chainError}`
        : "Options chain returned 0 contracts (Yahoo data limit).";
      host.innerHTML = `
        <div class="empty" style="text-align:left;padding:14px">
          <div style="color:#f1c870;font-weight:600;margin-bottom:6px">⚠ ${msg}</div>
          <div style="font-size:12px;color:#97a1ab;line-height:1.5">
            Yahoo Finance throttles options data and occasionally returns nothing — especially right at market open or for non-standard tickers. Try:<br>
            • Click <b>Refresh</b> in the header in 30–60 seconds<br>
            • Try a more liquid ticker (SPY, QQQ, AAPL)<br>
            • Wait for Schwab API approval for institutional-grade chain data
          </div>
        </div>`;
    } else {
      host.innerHTML = '<div class="empty">No setups triggered right now.</div>';
    }
    return;
  }
  // Status summary chips at top
  const counts = { GO: 0, READY: 0, STANDBY: 0, INVALID: 0 };
  for (const r of recs) counts[r.status || "STANDBY"]++;
  host.innerHTML = `
    <div class="status-summary">
      <span class="ss-chip go">${counts.GO} GO</span>
      <span class="ss-chip ready">${counts.READY} READY</span>
      <span class="ss-chip standby">${counts.STANDBY} STANDBY</span>
      <span class="ss-chip invalid">${counts.INVALID} INVALID</span>
    </div>`;
  for (const r of recs) {
    const el = document.createElement("div");
    const statusCls = (r.status || "STANDBY").toLowerCase();
    el.className = `rec ${r.direction} status-${statusCls}`;
    const distStr = r.distance_pct != null
      ? (r.distance_pct >= 0 ? "+" : "") + r.distance_pct + "%"
      : "—";
    el.innerHTML = `
      <h3>
        <span class="status-badge ${statusCls}">${r.status_label || r.status || "STANDBY"}</span>
        <span class="strategy-name">${r.strategy}</span>
        <span class="badge">${r.direction.toUpperCase()}</span>
      </h3>
      <div class="validity-note ${statusCls}">${r.validity_note || ""}</div>
      <div class="strike">${r.type} $${fmt(r.strike)} @ $${fmt(r.current_premium)}</div>
      <div class="reason">${r.reasoning}</div>
      <div class="grid">
        <div><span class="k">Ticker</span><span class="v">${r.ticker || "—"}</span></div>
        <div><span class="k">Δ</span><span class="v">${fmt(r.delta, 3)}</span></div>
        <div><span class="k">Bid</span><span class="v">${fmt(r.bid)}</span></div>
        <div><span class="k">Ask</span><span class="v">${fmt(r.ask)}</span></div>
        <div><span class="k">Entry trigger</span><span class="v">${r.entry_trigger}</span></div>
        <div><span class="k">Distance to entry</span><span class="v">${distStr}</span></div>
      </div>
      <div class="targets">
        <div class="entry"><div class="label">Entry SPY</div><div class="val">$${fmt(r.entry_spy_price)}</div></div>
        <div class="target"><div class="label">Target SPY / Prem</div><div class="val">$${fmt(r.profit_target_spy)} → $${fmt(r.profit_target_premium)}</div></div>
        <div class="stop"><div class="label">Stop SPY / Prem</div><div class="val">$${fmt(r.stop_loss_spy)} / $${fmt(r.stop_loss_premium)}</div></div>
      </div>`;
    host.appendChild(el);
  }
}
function renderChain(d) {
  const tbody = document.querySelector("#chain tbody");
  tbody.innerHTML = "";
  const pivots = lastAnalysis ? Object.entries(lastAnalysis.pivots) : [];
  const spot = (d && d.current_price) || (lastAnalysis && lastAnalysis.spy && lastAnalysis.spy.price) || null;

  // Group contracts by strike
  const byStrike = new Map();
  for (const c of d.chain || []) {
    if (!byStrike.has(c.strike)) byStrike.set(c.strike, {});
    byStrike.get(c.strike)[c.type] = c;
  }
  const strikes = [...byStrike.keys()].sort((a, b) => a - b);

  const sideCells = (c, side) => {
    if (!c) {
      return `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
    }
    const vol = c.volume || 0;
    const oi = c.open_interest || 0;
    const volOiRatio = oi > 0 ? vol / oi : null;
    const volOiCls = volOiRatio != null && volOiRatio > 1 ? "hot" : volOiRatio != null && volOiRatio > 0.5 ? "warm" : "";
    const ba = `${fmt(c.bid)} × ${fmt(c.ask)}`;
    if (side === "call") {
      // CALL side — order mirrors towards strike (Bid×Ask closest to strike)
      return `
        <td class="${volOiCls}">${volOiRatio != null ? volOiRatio.toFixed(2) : "—"}</td>
        <td>${fmtInt(vol)}</td>
        <td>${fmtInt(oi)}</td>
        <td>${fmt(c.iv, 1)}</td>
        <td>${fmt(c.theta, 2)}</td>
        <td>${fmt(c.gamma, 3)}</td>
        <td>${fmt(c.delta, 3)}</td>
        <td class="mid-cell">${fmt(c.mid)}</td>
        <td class="ba-cell">${ba}</td>`;
    } else {
      // PUT side — order mirrored (Bid×Ask closest to strike)
      return `
        <td class="ba-cell">${ba}</td>
        <td class="mid-cell">${fmt(c.mid)}</td>
        <td>${fmt(c.delta, 3)}</td>
        <td>${fmt(c.gamma, 3)}</td>
        <td>${fmt(c.theta, 2)}</td>
        <td>${fmt(c.iv, 1)}</td>
        <td>${fmtInt(oi)}</td>
        <td>${fmtInt(vol)}</td>
        <td class="${volOiCls}">${volOiRatio != null ? volOiRatio.toFixed(2) : "—"}</td>`;
    }
  };

  for (const strike of strikes) {
    const pair = byStrike.get(strike);
    const call = pair.call;
    const put = pair.put;
    const near = pivots.find(([, v]) => Math.abs(v - strike) <= 1);
    const isAtm = spot && Math.abs(strike - spot) < 1;
    const tr = document.createElement("tr");
    const classes = [];
    if (near) classes.push("near-level");
    if (isAtm) classes.push("atm-row");
    if (classes.length) tr.className = classes.join(" ");
    const strikeLabel = near ? `${fmt(strike)} <span class="lvl">${near[0]}</span>` : fmt(strike);
    tr.innerHTML = `
      ${sideCells(call, "call")}
      <td class="strike-col"><strong>${strikeLabel}</strong></td>
      ${sideCells(put, "put")}`;
    tbody.appendChild(tr);
  }
}
const REFRESH_INTERVAL_KEY = "bandaru_refresh_interval_ms";
function getRefreshIntervalMs() {
  const sel = $("auto-interval");
  // Prefer the dropdown value; fall back to localStorage; default 10s
  const fromSel = sel ? parseInt(sel.value, 10) : NaN;
  if (Number.isFinite(fromSel) && fromSel > 0) return fromSel;
  const saved = parseInt(localStorage.getItem(REFRESH_INTERVAL_KEY) || "10000", 10);
  return Number.isFinite(saved) && saved > 0 ? saved : 10000;
}
function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const sel = $("auto-interval");
  // Sync the dropdown with the persisted choice on first call
  if (sel) {
    const saved = localStorage.getItem(REFRESH_INTERVAL_KEY);
    if (saved && [...sel.options].some((o) => o.value === saved)) {
      sel.value = saved;
    }
    sel.disabled = !$("auto").checked;
  }
  if ($("auto").checked) {
    const ms = getRefreshIntervalMs();
    refreshTimer = setInterval(() => {
      fetchAnalysis(); fetchChain(); fetchWatchlist();
    }, ms);
    // Also notify the chart so its independent timer uses the same cadence
    if (window.BandaruChart && window.BandaruChart.setRefreshInterval) {
      window.BandaruChart.setRefreshInterval(ms);
    }
  } else if (window.BandaruChart && window.BandaruChart.setRefreshInterval) {
    window.BandaruChart.setRefreshInterval(0);  // 0 = pause chart auto-refresh
  }
}
// ---------- Stock Screener ----------
const SCREENER_LIST_KEY = "bandaru_screener_list";
const DEFAULT_SCREENER_LIST = "SPY,QQQ,IWM,DIA,AAPL,MSFT,GOOGL,META,NVDA,AMD,TSLA,AMZN,JPM,BAC,XOM,UNH";

function _scoreClass(score) {
  if (score >= 85) return "score-strong";
  if (score >= 65) return "score-actionable";
  if (score >= 40) return "score-watch";
  return "score-none";
}

function _oppPill(label, direction) {
  const cls = direction === "bull" ? "opp-bull" : direction === "bear" ? "opp-bear" : "opp-neutral";
  return `<span class="opp-pill ${cls}">${label}</span>`;
}

function renderScreenerResults(results, filter) {
  const tbody = document.querySelector("#screener-table tbody");
  if (!results || !results.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No results.</td></tr>';
    return;
  }
  // Apply filter
  let filtered = results;
  if (filter === "bull") filtered = filtered.filter((r) => r.direction === "bull");
  else if (filter === "bear") filtered = filtered.filter((r) => r.direction === "bear");
  else if (filter === "actionable") filtered = filtered.filter((r) => (r.score || 0) >= 65);
  else if (filter === "strong") filtered = filtered.filter((r) => (r.score || 0) >= 85);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No matches for that filter.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    if (r.error) {
      return `<tr class="screener-row error">
        <td>—</td>
        <td>${r.ticker}</td>
        <td colspan="8" class="muted">${r.error}</td>
      </tr>`;
    }
    const chgCls = r.change_pct >= 0 ? "bull" : "bear";
    const chgArrow = r.change_pct >= 0 ? "▲" : "▼";
    const rsiCls = r.rsi == null ? "" : r.rsi >= 70 ? "warn" : r.rsi <= 30 ? "warn" : "";
    const adxCls = r.adx == null ? "" : r.adx >= 25 ? "warn" : "";
    const trendCls = r.trend === "Bullish" ? "up" : r.trend === "Bearish" ? "down" : "";
    return `<tr class="screener-row" data-ticker="${r.ticker}" title="Click to load ${r.ticker} in the dashboard">
      <td class="screener-score ${_scoreClass(r.score)}">${r.score || 0}</td>
      <td class="screener-ticker"><b>${r.ticker}</b></td>
      <td>$${r.price?.toFixed(2) || "—"}</td>
      <td class="${chgCls}">${chgArrow} ${r.change_pct?.toFixed(2) || 0}%</td>
      <td>${_oppPill(r.opportunity, r.direction)}</td>
      <td class="screener-why">${r.why || ""}</td>
      <td class="${rsiCls}">${r.rsi ?? "—"}</td>
      <td class="${adxCls}">${r.adx ?? "—"}</td>
      <td class="${trendCls}">${r.trend || "—"}</td>
      <td>${r.volume_x_avg ? r.volume_x_avg.toFixed(2) + "×" : "—"}</td>
    </tr>`;
  }).join("");

  // Wire click-to-switch on each row
  tbody.querySelectorAll(".screener-row[data-ticker]").forEach((row) => {
    row.addEventListener("click", () => {
      const t = row.dataset.ticker;
      if (!t) return;
      // Switch the entire dashboard to this ticker (uses existing setActiveTicker if present)
      if (typeof setActiveTicker === "function") {
        setActiveTicker(t);
      } else {
        try { localStorage.setItem("bandaru_active_ticker", t); } catch (e) {}
        window.location.reload();
      }
    });
  });
}

async function runScreener(symbols) {
  const statusEl = $("screener-status");
  if (statusEl) statusEl.textContent = `Scanning ${symbols.length} symbols…`;
  try {
    const url = `/api/screener?symbols=${encodeURIComponent(symbols.join(","))}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) {
      if (statusEl) statusEl.textContent = "Error: " + data.error;
      return;
    }
    if (statusEl) {
      const cached = data.cached ? " (cached)" : "";
      statusEl.textContent = `${data.count} symbols · ${data.elapsed_ms}ms${cached}`;
    }
    const filter = ($("screener-filter-select") || {}).value || "all";
    renderScreenerResults(data.results, filter);
    // Remember filter selection for re-renders
    window._lastScreenerResults = data.results;
  } catch (e) {
    if (statusEl) statusEl.textContent = "Fetch failed: " + e.message;
  }
}

function wireScreener() {
  const form = $("screener-form");
  const input = $("screener-input");
  const reset = $("screener-reset");
  const filterSel = $("screener-filter-select");
  if (!form || !input) return;

  // Restore last list from localStorage if present
  try {
    const saved = localStorage.getItem(SCREENER_LIST_KEY);
    if (saved) input.value = saved;
  } catch (e) {}

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = (input.value || "").trim();
    const symbols = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return;
    try { localStorage.setItem(SCREENER_LIST_KEY, symbols.join(",")); } catch (e) {}
    runScreener(symbols);
  });

  if (reset) {
    reset.addEventListener("click", () => {
      input.value = DEFAULT_SCREENER_LIST;
      try { localStorage.setItem(SCREENER_LIST_KEY, DEFAULT_SCREENER_LIST); } catch (e) {}
    });
  }

  if (filterSel) {
    filterSel.addEventListener("change", () => {
      if (window._lastScreenerResults) {
        renderScreenerResults(window._lastScreenerResults, filterSel.value);
      }
    });
  }
}

// Run wireup when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireScreener);
} else {
  wireScreener();
}

// ---------- Trade Journal ----------
const JOURNAL_KEY = "spy_trade_journal";

function loadTrades() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveTrades(trades) {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(trades)); }
  catch (e) {}
}

function findMark(trade) {
  // Look up the current option price from the chain
  if (!lastChain || !Array.isArray(lastChain.chain)) return null;
  const t = lastChain.chain.find(
    (c) =>
      Math.abs(Number(c.strike) - Number(trade.strike)) < 0.01 &&
      (c.type || "").toLowerCase() === trade.type.toLowerCase()
  );
  if (!t) return null;
  return t.mid || t.mark || t.last || ((t.bid || 0) + (t.ask || 0)) / 2 || null;
}

function pnlFor(trade) {
  // For closed trades, use exit_price; for open, use current mark
  const mark = trade.exit_price != null ? trade.exit_price : findMark(trade);
  if (mark == null) return { dollar: null, pct: null, mark: null };
  const dollar = (mark - trade.entry_price) * trade.qty * 100;
  const pct = ((mark - trade.entry_price) / trade.entry_price) * 100;
  return { dollar, pct, mark };
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso; }
}

function fmtDuration(startISO, endISO) {
  try {
    const ms = new Date(endISO) - new Date(startISO);
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h${m % 60}m`;
  } catch (e) { return ""; }
}

function renderJournal() {
  const trades = loadTrades();
  const today = new Date().toISOString().slice(0, 10);
  const open = trades.filter((t) => t.exit_price == null);
  const closedToday = trades.filter(
    (t) => t.exit_price != null && (t.exit_time || "").startsWith(today)
  );

  // Summary
  let totalRealized = 0;
  let totalUnrealized = 0;
  let wins = 0;
  let losses = 0;
  for (const t of closedToday) {
    const p = pnlFor(t);
    if (p.dollar != null) {
      totalRealized += p.dollar;
      if (p.dollar > 0) wins++;
      else if (p.dollar < 0) losses++;
    }
  }
  for (const t of open) {
    const p = pnlFor(t);
    if (p.dollar != null) totalUnrealized += p.dollar;
  }
  const totalPnl = totalRealized + totalUnrealized;
  const winRate = closedToday.length ? Math.round((wins / closedToday.length) * 100) : null;

  const sumCell = (k, v, cls) =>
    `<div class="stat-cell"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span></div>`;
  $("journal-summary").innerHTML = [
    sumCell(
      "Realized P&L Today",
      "$" + totalRealized.toFixed(2),
      totalRealized > 0 ? "up" : totalRealized < 0 ? "down" : ""
    ),
    sumCell(
      "Unrealized (Open)",
      "$" + totalUnrealized.toFixed(2),
      totalUnrealized > 0 ? "up" : totalUnrealized < 0 ? "down" : ""
    ),
    sumCell(
      "Total P&L",
      "$" + totalPnl.toFixed(2),
      totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : ""
    ),
    sumCell(
      "Win Rate",
      winRate == null ? "—" : winRate + "%",
      winRate == null ? "" : winRate >= 50 ? "up" : "down"
    ),
  ].join("");

  $("open-count").textContent = open.length ? `(${open.length})` : "";
  $("closed-count").textContent = closedToday.length ? `(${closedToday.length})` : "";

  // Open trades
  const openBody = document.querySelector("#open-trades tbody");
  openBody.innerHTML = "";
  for (const t of open) {
    const p = pnlFor(t);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtTime(t.entry_time)}</td>
      <td class="type-${t.type.toLowerCase()}">${t.type}</td>
      <td>$${fmt(t.strike)}</td>
      <td>${t.expiration}</td>
      <td>${t.qty}</td>
      <td>$${fmt(t.entry_price)}</td>
      <td>${p.mark != null ? "$" + fmt(p.mark) : "—"}</td>
      <td class="${p.dollar == null ? '' : p.dollar > 0 ? 'pnl-pos' : p.dollar < 0 ? 'pnl-neg' : ''}">${p.dollar != null ? (p.dollar > 0 ? "+" : "") + "$" + p.dollar.toFixed(2) : "—"}</td>
      <td class="${p.pct == null ? '' : p.pct > 0 ? 'pnl-pos' : p.pct < 0 ? 'pnl-neg' : ''}">${p.pct != null ? (p.pct > 0 ? "+" : "") + p.pct.toFixed(1) + "%" : "—"}</td>
      <td>${t.platform || "—"}</td>
      <td>${t.notes || ""}</td>
      <td>
        <button class="close-btn" data-id="${t.id}">Close</button>
        <button class="del-btn" data-id="${t.id}">×</button>
      </td>`;
    openBody.appendChild(tr);
  }

  // Closed trades (today)
  const closedBody = document.querySelector("#closed-trades tbody");
  closedBody.innerHTML = "";
  for (const t of closedToday) {
    const p = pnlFor(t);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtTime(t.exit_time)}</td>
      <td class="type-${t.type.toLowerCase()}">${t.type}</td>
      <td>$${fmt(t.strike)}</td>
      <td>${t.qty}</td>
      <td>$${fmt(t.entry_price)}</td>
      <td>$${fmt(t.exit_price)}</td>
      <td class="${p.dollar == null ? '' : p.dollar > 0 ? 'pnl-pos' : 'pnl-neg'}">${p.dollar != null ? (p.dollar > 0 ? "+" : "") + "$" + p.dollar.toFixed(2) : "—"}</td>
      <td>${fmtDuration(t.entry_time, t.exit_time)}</td>
      <td>${t.platform || "—"}</td>
      <td>${t.notes || ""}</td>
      <td><button class="del-btn" data-id="${t.id}">×</button></td>`;
    closedBody.appendChild(tr);
  }

  // Wire buttons
  document.querySelectorAll(".close-btn").forEach((b) =>
    b.addEventListener("click", () => closeTrade(b.dataset.id))
  );
  document.querySelectorAll(".del-btn").forEach((b) =>
    b.addEventListener("click", () => deleteTrade(b.dataset.id))
  );
}

function addTrade(form) {
  const f = new FormData(form);
  const trades = loadTrades();
  const trade = {
    id: String(Date.now()),
    type: f.get("type"),
    strike: Number(f.get("strike")),
    entry_price: Number(f.get("entry_price")),
    qty: Number(f.get("qty")) || 1,
    expiration: f.get("expiration"),
    platform: f.get("platform") || "",
    notes: f.get("notes") || "",
    entry_time: new Date().toISOString(),
    exit_price: null,
    exit_time: null,
  };
  trades.push(trade);
  saveTrades(trades);
  form.reset();
  // Default expiration back to today after reset
  form.querySelector('[name="expiration"]').value = new Date().toISOString().slice(0, 10);
  renderJournal();
}

function closeTrade(id) {
  const trades = loadTrades();
  const t = trades.find((x) => x.id === id);
  if (!t) return;
  const liveMark = findMark(t);
  const suggested = liveMark != null ? liveMark.toFixed(2) : t.entry_price;
  const exitStr = prompt(
    `Exit price per contract for ${t.type} $${t.strike}\n(Current mark: ${liveMark != null ? "$" + liveMark.toFixed(2) : "n/a"})`,
    suggested
  );
  if (exitStr == null) return;
  const exitPrice = Number(exitStr);
  if (isNaN(exitPrice)) return alert("Invalid number");
  t.exit_price = exitPrice;
  t.exit_time = new Date().toISOString();
  saveTrades(trades);
  renderJournal();
}

function deleteTrade(id) {
  if (!confirm("Delete this trade? This cannot be undone.")) return;
  const trades = loadTrades().filter((t) => t.id !== id);
  saveTrades(trades);
  renderJournal();
}

function exportCSV() {
  const trades = loadTrades();
  if (!trades.length) return alert("No trades to export");
  const headers = ["id","type","strike","expiration","qty","entry_price","entry_time","exit_price","exit_time","platform","notes","pnl_dollar"];
  const rows = trades.map((t) => {
    const p = pnlFor(t);
    return [t.id, t.type, t.strike, t.expiration, t.qty, t.entry_price, t.entry_time,
            t.exit_price ?? "", t.exit_time ?? "", t.platform ?? "", (t.notes||"").replace(/,/g, ";"),
            p.dollar != null ? p.dollar.toFixed(2) : ""].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spy_trades_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearClosed() {
  if (!confirm("Clear all closed trades? Open trades remain.")) return;
  const remaining = loadTrades().filter((t) => t.exit_price == null);
  saveTrades(remaining);
  renderJournal();
}

// Wire journal events
$("add-trade").addEventListener("submit", (e) => { e.preventDefault(); addTrade(e.target); });
$("export-csv").addEventListener("click", exportCSV);
$("clear-closed").addEventListener("click", clearClosed);
// Default expiration to today
$("add-trade").querySelector('[name="expiration"]').value = new Date().toISOString().slice(0, 10);

$("refresh").addEventListener("click", () => { fetchAnalysis(); fetchChain(); fetchWatchlist(); });
const wlBtn = document.getElementById("watchlist-refresh");
if (wlBtn) wlBtn.addEventListener("click", fetchWatchlist);

// Add a new symbol to the watchlist
const wlAddForm = document.getElementById("watchlist-add-form");
const wlAddInput = document.getElementById("watchlist-add-input");
if (wlAddForm) {
  wlAddForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const sym = (wlAddInput.value || "").trim();
    if (!sym) return;
    if (addWatchlistSymbol(sym)) {
      wlAddInput.value = "";
      fetchWatchlist();
    }
  });
}

// Reset watchlist to default
const wlResetBtn = document.getElementById("watchlist-reset");
if (wlResetBtn) {
  wlResetBtn.addEventListener("click", () => {
    resetWatchlist();
    fetchWatchlist();
  });
}
$("auto").addEventListener("change", scheduleAutoRefresh);
// Refresh-interval dropdown — persist choice and immediately re-schedule
if ($("auto-interval")) {
  $("auto-interval").addEventListener("change", (e) => {
    localStorage.setItem(REFRESH_INTERVAL_KEY, e.target.value);
    scheduleAutoRefresh();
  });
}
// (Chain type-filter removed — calls and puts now share a row per strike)

// --- Alerts toggle wiring ---
$("alerts").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const ok = await requestNotificationPermission();
    if (!ok) {
      alert(
        "Browser notifications are blocked. Enable them in System Settings → Notifications → Safari (or your browser), then toggle this checkbox again."
      );
      e.target.checked = false;
      return;
    }
    // Re-arm and play a quick test chime so user knows it works
    alertsArmed = false;
    playChime("bullish");
    localStorage.setItem("spy_alerts_enabled", "1");
  } else {
    localStorage.removeItem("spy_alerts_enabled");
  }
});

// Restore prior preference
seenAlerts = loadSeen();
if (localStorage.getItem("spy_alerts_enabled") === "1" && "Notification" in window) {
  $("alerts").checked = Notification.permission === "granted";
}

// ---------- Tab switching ----------
function safeQuery(sel) {
  try { return document.querySelector(sel); }
  catch (e) { return null; }
}
function isValidTabName(name) {
  return /^[a-z0-9_-]{1,30}$/i.test(name || "");
}
function switchTab(name) {
  if (!isValidTabName(name)) return;
  document.querySelectorAll(".tab-pane").forEach((el) =>
    el.classList.toggle("active", el.dataset.tab === name)
  );
  document.querySelectorAll(".tab-btn").forEach((el) =>
    el.classList.toggle("active", el.dataset.tab === name)
  );
  if (location.hash.slice(1) !== name) {
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
  }
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (isValidTabName(name) && safeQuery(`.tab-pane[data-tab="${name}"]`)) {
    switchTab(name);
  }
});

// Pop-out current tab into a new window — drag to another monitor.
$("popout-btn").addEventListener("click", () => {
  const active =
    document.querySelector(".tab-btn.active").dataset.tab || "chart";
  const w = window.open(
    `${location.pathname}?popout=1#${active}`,
    `spy-${active}`,
    "width=1400,height=950,menubar=no,toolbar=no,location=no,status=no"
  );
  if (!w) {
    alert(
      "Browser blocked the pop-up. Allow pop-ups for this site (Safari: Preferences → Websites → Pop-up Windows → Allow) and try again."
    );
  }
});

// Popout mode: hide tab nav, give the active tab the full window
if (new URLSearchParams(location.search).get("popout") === "1") {
  document.body.classList.add("popout-mode");
}

// Initial tab from URL hash, default = chart
const initialTab = location.hash.slice(1) || "chart";
if (isValidTabName(initialTab) && safeQuery(`.tab-pane[data-tab="${initialTab}"]`)) {
  switchTab(initialTab);
}

// Ticker picker wiring
const tickerInput = document.getElementById("ticker-input");
const tickerGo = document.getElementById("ticker-go");
if (tickerInput) tickerInput.value = activeTicker;
const activeTickerEl = document.getElementById("active-ticker");
if (activeTickerEl) activeTickerEl.textContent = activeTicker;
document.title = `${activeTicker} — Bandaru Trade Analysis`;

if (tickerGo) tickerGo.addEventListener("click", () => setActiveTicker(tickerInput.value));
if (tickerInput) tickerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") setActiveTicker(tickerInput.value);
});
document.querySelectorAll(".ticker-presets button").forEach((btn) => {
  btn.addEventListener("click", () => setActiveTicker(btn.dataset.t));
});

fetchAnalysis();
fetchChain();
fetchWatchlist();
renderJournal();
scheduleAutoRefresh();
