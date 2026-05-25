import { useEffect, useMemo, useState } from "react";
import { getScreener } from "../api.js";
import { distinctSorted, hasActiveFilters } from "../colFilter.js";

// Major US index proxies + headline indexes.
const INDEXES = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "VIX"];

// US large-caps (market cap > ~$10B), largest first. The dropdown lists each
// for a single-stock scan; the universe presets scan capped subsets so a live
// scan stays fast (a true ~1000-name live scan would take minutes/time out).
const LARGE_CAPS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "LLY", "JPM",
  "V", "XOM", "UNH", "MA", "COST", "HD", "PG", "JNJ", "ORCL", "ABBV",
  "BAC", "KO", "MRK", "CVX", "WMT", "CRM", "AMD", "PEP", "NFLX", "TMO",
  "ADBE", "LIN", "ACN", "MCD", "CSCO", "ABT", "WFC", "DHR", "INTC", "TXN",
  "QCOM", "INTU", "AMAT", "GE", "CAT", "VZ", "AXP", "PFE", "IBM", "NOW",
  "GS", "MS", "RTX", "HON", "UNP", "LOW", "SPGI", "BKNG", "T", "ISRG",
  "AMGN", "NEE", "PLTR", "UBER", "BLK", "SCHW", "ELV", "C", "SYK", "DE",
  "BSX", "TJX", "LMT", "ADP", "MDT", "GILD", "VRTX", "CB", "MMC", "PGR",
  "REGN", "ETN", "MU", "BA", "SO", "KLAC", "PANW", "SNPS", "CDNS", "DUK",
  "ICE", "SHW", "CME", "ZTS", "APH", "MO", "CL", "TDG", "WM", "AON",
  "CMG", "ITW", "MCK", "EQIX", "GD", "NOC", "BDX", "MSI", "FCX", "PYPL",
  "TGT", "SLB", "HCA", "EMR", "PH", "MAR", "ORLY", "COF", "CARR", "ABNB",
  "NXPI", "PCAR", "ROP", "AJG", "MMM", "ADI", "WELL", "TT", "F", "GM",
  "DAL", "COIN", "MSTR", "SNOW", "SBUX", "NKE", "DIS", "BABA",
];

// Universe presets resolved to a symbol list for a scan. Single-stock picks
// use the "s:TICKER" form.
function resolveSymbols(sel) {
  if (sel === "u:mega") return [...INDEXES.slice(0, 4), ...LARGE_CAPS.slice(0, 24)];
  if (sel === "u:wide") return [...INDEXES, ...LARGE_CAPS.slice(0, 62)];
  if (sel === "u:indexes") return [...INDEXES];
  if (sel && sel.startsWith("s:")) return [sel.slice(2)];
  return [...INDEXES, ...LARGE_CAPS.slice(0, 37)]; // "u:core" — the default
}

const COLUMNS = [
  { key: "ticker",      label: "Symbol",  align: "left",  sticky: true },
  { key: "last",        label: "Last",    align: "right", format: (v) => money(v) },
  { key: "mark",        label: "Mark",    align: "right", format: (v) => money(v) },
  { key: "net_chg",     label: "Net Chg", align: "right", format: signedMoney, classer: signedClass },
  { key: "change_pct",  label: "Δ%",      align: "right", format: (v) => v != null ? `${v.toFixed(2)}%` : "—", classer: signedClass },
  { key: "open",        label: "Open",    align: "right", format: money },
  { key: "high",        label: "High",    align: "right", format: money },
  { key: "low",         label: "Low",     align: "right", format: money },
  { key: "pivot_zone",  label: "Pivots",  align: "left",  format: (v) => v || "—" },
  { key: "trend",       label: "Trend",   align: "left",  classer: trendClass },
  { key: "mtf",         label: "MTF",     align: "center", format: (v) => v || "—", classer: (_, row) => `mtf-${row.mtf_dir || "neutral"}` },
  { key: "rsi",         label: "RSI",     align: "right", format: (v) => v != null ? v.toFixed(1) : "—", classer: rsiClass },
  { key: "adx",         label: "ADX",     align: "right", format: (v) => v != null ? v.toFixed(1) : "—", classer: (v) => (v >= 25 ? "trending" : "") },
  { key: "iv_atm",      label: "IV%",     align: "right", format: (v) => v != null ? `${v.toFixed(0)}%` : "—" },
  { key: "iv_hv",       label: "IV/HV",   align: "right", format: (v) => v != null ? `${v.toFixed(2)}×` : "—", classer: ivhvClass },
  { key: "volume",      label: "Volume",  align: "right", format: vol },
  { key: "volume_x_avg",label: "RVol",    align: "right", format: (v) => v != null ? `${v.toFixed(2)}×` : "—", classer: (v) => (v >= 1.5 ? "up" : "") },
  { key: "ttm_squeeze", label: "TTM Sq",  align: "left",  classer: sqClass },
  { key: "gamma_wall",  label: "γ Wall",  align: "right", format: gammaFmt, classer: gammaClass },
  { key: "breakout",    label: "Break",   align: "left",  classer: (v) => v === "BULL BREAK" ? "up" : v === "BEAR BREAK" ? "down" : "" },
  { key: "score",       label: "Score",   align: "right" },
  { key: "opportunity", label: "Opportunity", align: "left", classer: (_, row) => `opp ${row.direction}` },
  { key: "why",         label: "Why",     align: "left",  className: "why" },
];

function money(v)        { return v != null ? `$${v.toFixed(2)}` : "—"; }
function signedMoney(v)  { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`; }
function signedClass(v)  { return v == null ? "" : v >= 0 ? "up" : "down"; }
function trendClass(v)   {
  const t = (v || "").toLowerCase();
  if (t.includes("bull")) return "trend-bull";
  if (t.includes("bear")) return "trend-bear";
  return "trend-neutral";
}
function rsiClass(v) {
  if (v == null) return "";
  if (v >= 70) return "rsi-hot";
  if (v <= 30) return "rsi-cold";
  return "";
}
function sqClass(v) {
  if (v === "FIRED BULL") return "up";
  if (v === "FIRED BEAR") return "down";
  if (v === "ON") return "squeeze-on";
  return "";
}
function ivhvClass(v) {
  if (v == null) return "";
  if (v >= 1.25) return "iv-rich";
  if (v <= 0.85) return "iv-cheap";
  return "";
}
function gammaFmt(v, row) {
  if (v == null) return "—";
  const tag = row?.gamma_flag === "RISK" ? " ⚠" : row?.gamma_flag === "WATCH" ? " •" : "";
  return `$${v}${tag}`;
}
function gammaClass(_, row) {
  if (row?.gamma_flag === "RISK") return "gamma-risk";
  if (row?.gamma_flag === "WATCH") return "gamma-watch";
  return "";
}
function vol(v) {
  if (v == null) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

export default function Screener({ onPickTicker }) {
  const [universe, setUniverse] = useState(() => localStorage.getItem("bandaru_screener_uni") || "u:core");
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem("bandaru_screener_tf") || "daily");
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("Ready to scan.");
  const [scanning, setScanning] = useState(false);
  const [sortKey, setSortKey] = useState("ticker");
  const [sortAsc, setSortAsc] = useState(true);
  const [colFilters, setColFilters] = useState({});

  const setColFilter = (key, val) => setColFilters((f) => ({ ...f, [key]: val }));
  const clearColFilters = () => setColFilters({});
  const filtersActive = hasActiveFilters(colFilters);

  // Distinct values per column → options for each header dropdown.
  const columnOptions = useMemo(() => {
    const opts = {};
    for (const c of COLUMNS) {
      opts[c.key] = distinctSorted(
        results.map((r) => String(c.format ? c.format(r[c.key], r) : (r[c.key] ?? "—"))),
      );
    }
    return opts;
  }, [results]);

  const scan = async (tf = timeframe, uni = universe) => {
    const symbols = resolveSymbols(uni);
    if (!symbols.length) return;
    setScanning(true);
    setStatus(`Scanning ${symbols.length} symbol${symbols.length > 1 ? "s" : ""} · ${tf === "15m" ? "15-minute" : "daily"} window…`);
    localStorage.setItem("bandaru_screener_uni", uni);
    try {
      const data = await getScreener(symbols, tf);
      setResults(data.results);
      const ok = data.ok_count ?? data.results.filter((r) => !r.error).length;
      const err = data.error_count ?? data.results.filter((r) => r.error).length;
      setStatus(`${ok}/${data.count} loaded · ${data.timeframe || tf} window${err ? ` · ${err} errored` : ""} · ${data.elapsed_ms}ms`);
    } catch (e) {
      const msg = /timeout/i.test(e.message)
        ? "Scan timed out — data source is slow. Try again in a moment."
        : e.message;
      setStatus("Error: " + msg);
    } finally {
      setScanning(false);
    }
  };

  // Persist + (re)scan whenever the timeframe or universe changes. Runs on mount.
  useEffect(() => {
    localStorage.setItem("bandaru_screener_tf", timeframe);
    scan(timeframe, universe);
    /* eslint-disable-next-line */
  }, [timeframe, universe]);

  const filtered = useMemo(() => {
    let rows = results.filter((r) => {
      if (filter === "bull") return r.direction === "bull";
      if (filter === "bear") return r.direction === "bear";
      if (filter === "actionable") return (r.score || 0) >= 65;
      if (filter === "strong") return (r.score || 0) >= 85;
      if (filter === "gamma") return r.gamma_flag === "RISK" || r.gamma_flag === "WATCH";
      if (filter === "aligned") return r.mtf_dir === "bull" || r.mtf_dir === "bear";
      if (filter === "errors") return !!r.error;
      return true;
    });

    // Per-column header filters — keep rows whose displayed cell equals the
    // value picked in that column's dropdown. Every active column must match.
    const activeCols = COLUMNS.filter((c) => String(colFilters[c.key] ?? "").trim());
    if (activeCols.length) {
      rows = rows.filter((r) =>
        activeCols.every((c) => {
          const disp = String(c.format ? c.format(r[c.key], r) : (r[c.key] ?? "—"));
          return disp === colFilters[c.key];
        }),
      );
    }

    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
        return sortAsc
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [results, filter, sortKey, sortAsc, colFilters]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "ticker"); }
  };

  return (
    <div className="card screener-card">
      <div className="screener-header">
        <h2>Stock Screener</h2>
        <p className="muted">
          {results.length ? results.length + " stocks scanned · click any row to switch the dashboard" : "Scans your list for actionable setups."}
        </p>
      </div>

      <div className="screener-controls">
        <select className="screener-universe" value={universe}
                onChange={(e) => setUniverse(e.target.value)} disabled={scanning}>
          <optgroup label="Scan a universe">
            <option value="u:core">★ Top US Large-Caps + Major Indexes (~45)</option>
            <option value="u:mega">Mega-Caps + Indexes (~28)</option>
            <option value="u:wide">Extended Large-Caps (~70 · slower)</option>
            <option value="u:indexes">Major Indexes only (8)</option>
          </optgroup>
          <optgroup label="Scan a single stock (market cap &gt; $10B)">
            {LARGE_CAPS.map((t) => <option key={t} value={`s:${t}`}>{t}</option>)}
          </optgroup>
        </select>
        <button className="primary" onClick={() => scan()} disabled={scanning}>{scanning ? "Scanning…" : "🔍 Scan"}</button>
        <div className="screener-tf" title="Analysis window for trend / RSI / ADX / squeeze">
          <label>Window</label>
          {["15m", "daily"].map((tf) => (
            <button key={tf} className={timeframe === tf ? "active" : ""}
              disabled={scanning}
              onClick={() => setTimeframe(tf)}>
              {tf === "15m" ? "15m" : "Daily"}
            </button>
          ))}
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="bull">Bullish only</option>
          <option value="bear">Bearish only</option>
          <option value="aligned">MTF aligned</option>
          <option value="actionable">Actionable ≥65</option>
          <option value="strong">Strong only ≥85</option>
          <option value="gamma">Gamma flag</option>
          <option value="errors">Errors</option>
        </select>
        {filtersActive && (
          <button className="ghost screener-clear" onClick={clearColFilters}
                  title="Clear all column filters">
            ✕ Clear column filters
          </button>
        )}
        <span className="status">
          {filtersActive ? `${filtered.length} match · ` : ""}{status}
        </span>
      </div>

      <div className="screener-table-wrap">
        <table className="screener-grid">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`align-${c.align} ${c.sticky ? "sticky-col" : ""}`}
                    onClick={() => toggleSort(c.key)}
                    title="Click to sort">
                  {c.label}{sortKey === c.key ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
            <tr className="screener-filter-row">
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.sticky ? "sticky-col" : ""}>
                  <select
                    className={`col-filter ${colFilters[c.key] ? "active" : ""}`}
                    value={colFilters[c.key] || ""}
                    title={`Filter by ${c.label}`}
                    onChange={(e) => setColFilter(c.key, e.target.value)}
                  >
                    <option value="">All</option>
                    {(columnOptions[c.key] || []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={COLUMNS.length} className="empty">
                {scanning ? "Scanning…"
                  : filtersActive && results.length ? "No rows match the column filters — adjust or clear them."
                  : "No matches — click 🔍 Scan to start."}
              </td></tr>
            ) : filtered.map((r) => (
              <tr key={r.ticker}
                  onClick={() => r.ticker && !r.error && onPickTicker?.(r.ticker)}
                  className={r.error ? "row-error" : ""}>
                {COLUMNS.map((c) => {
                  const v = r[c.key];
                  const cls = c.classer ? c.classer(v, r) : "";
                  const cell = c.format ? c.format(v, r) : (v ?? "—");
                  if (c.key === "ticker") {
                    return <td key={c.key} className={`align-${c.align} sticky-col ticker-cell ${cls}`}>
                      <b>{r.ticker}</b>
                      {r.error ? <div className="err-msg">{r.error}</div> : null}
                    </td>;
                  }
                  if (r.error) return <td key={c.key} className="muted">—</td>;
                  const title = c.key === "gamma_wall" && r.gamma_note ? r.gamma_note : undefined;
                  return <td key={c.key} className={`align-${c.align} ${cls} ${c.className || ""}`} title={title}>{cell}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="screener-note">
        <b>Column filters</b> — pick a value from any header dropdown to keep only the
        rows with that value. Dropdowns list the values actually present in the column
        and combine (AND) with each other and the filter above; use <b>✕ Clear column
        filters</b> to reset.
        {" "}<b>MTF</b> = 15-minute vs daily trend agreement (▲▲ aligned up, ▼▼ aligned down, mixed = amber).
        {" "}<b>IV%</b> = ATM implied volatility from the option chain.
        {" "}<b>IV/HV</b> = ATM IV ÷ 20-day realized volatility — an "are options rich?" gauge (above 1.25× = rich, below 0.85× = cheap).
        {" "}<b>γ Wall</b> = heaviest call open-interest strike above price, a gamma-squeeze magnet proxy (⚠ price within 4%, • within 8%).
        IV/HV and γ Wall are modeled estimates, not a true IV Rank or dealer-gamma model.
      </p>
    </div>
  );
}
