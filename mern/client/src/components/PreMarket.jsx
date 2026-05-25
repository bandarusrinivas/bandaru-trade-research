import { useEffect, useMemo, useState } from "react";
import { getPremarket } from "../api.js";
import { distinctSorted, hasActiveFilters } from "../colFilter.js";

function fmtVol(v) {
  if (v == null) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

function rvolClass(v) {
  if (v == null) return "";
  if (v >= 3) return "rvol-hot";
  if (v >= 2) return "rvol-warm";
  if (v >= 1) return "rvol-mild";
  return "rvol-cool";
}

// Column definitions. value() is the raw value used for numeric filtering;
// format() is what's displayed (and used for substring filtering).
const COLUMNS = [
  { key: "ticker", label: "Ticker",
    value: (r) => r.ticker, format: (r) => r.ticker || "—" },
  { key: "price", label: "Price",
    value: (r) => r.price,
    format: (r) => (r.price != null ? `$${r.price.toFixed(2)}` : "—") },
  { key: "gap_pct", label: "Gap %",
    value: (r) => r.gap_pct,
    format: (r) => (r.gap_pct != null ? `${r.gap_pct >= 0 ? "+" : ""}${r.gap_pct}%` : "—"),
    classer: (r) => (r.gap_pct >= 0 ? "up" : "down") },
  { key: "rvol", label: "RVOL",
    value: (r) => r.rvol,
    format: (r) => (r.rvol != null ? `${r.rvol}×` : "—"),
    classer: (r) => rvolClass(r.rvol) },
  { key: "day_volume", label: "Vol today",
    value: (r) => r.day_volume, format: (r) => fmtVol(r.day_volume) },
  { key: "avg_volume", label: "Avg vol",
    value: (r) => r.avg_volume, format: (r) => fmtVol(r.avg_volume) },
  { key: "day_range_pct", label: "Day range",
    value: (r) => r.day_range_pct,
    format: (r) => (r.day_range_pct != null ? `${r.day_range_pct}%` : "—") },
  { key: "bias", label: "Bias",
    value: (r) => r.bias, format: (r) => r.bias || "—",
    classer: (r) => (r.bias === "calls" ? "up" : r.bias === "puts" ? "down" : "muted") },
  { key: "atm_strike", label: "ATM",
    value: (r) => r.atm_strike, format: (r) => r.atm_strike ?? "—" },
  { key: "score", label: "Score",
    value: (r) => r.score, format: (r) => (r.score ?? "—") },
];

export default function PreMarket({ onPickTicker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlyUnusual, setOnlyUnusual] = useState(false);
  const [colFilters, setColFilters] = useState({});

  const setColFilter = (key, val) => setColFilters((f) => ({ ...f, [key]: val }));
  const clearColFilters = () => setColFilters({});
  const filtersActive = hasActiveFilters(colFilters);

  const scan = () => {
    setLoading(true); setError(null);
    getPremarket()
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { scan(); }, []);

  // Distinct values per column → options for each header dropdown.
  const columnOptions = useMemo(() => {
    const opts = {};
    const all = data?.results || [];
    for (const c of COLUMNS) {
      opts[c.key] = distinctSorted(all.map((r) => String(c.format(r))));
    }
    return opts;
  }, [data]);

  // Unusual-only toggle + per-column dropdown filters (ANDed together).
  const rows = useMemo(() => {
    let rs = (data?.results || []).filter((r) => !onlyUnusual || r.unusual);
    const activeCols = COLUMNS.filter((c) => String(colFilters[c.key] ?? "").trim());
    if (activeCols.length) {
      rs = rs.filter((r) =>
        activeCols.every((c) => String(c.format(r)) === colFilters[c.key]),
      );
    }
    return rs;
  }, [data, onlyUnusual, colFilters]);

  return (
    <div className="premarket-page">
      <div className="card">
        <div className="profile-card-head">
          <h2>Pre-Market Unusual Volume Scanner</h2>
          <span className="muted small">
            {data ? `session: ${data.session} · ${data.count} scanned · ${data.elapsed_ms}ms` : ""}
          </span>
        </div>

        <div className="pm-controls">
          <button className="bt-run" onClick={scan} disabled={loading}>
            {loading ? "Scanning…" : "Re-scan"}
          </button>
          <label className="pm-toggle">
            <input type="checkbox" checked={onlyUnusual} onChange={(e) => setOnlyUnusual(e.target.checked)} />
            Unusual only
          </label>
          {filtersActive && (
            <button className="ghost screener-clear" onClick={clearColFilters}
                    title="Clear all column filters">
              ✕ Clear column filters
            </button>
          )}
          {data && (
            <span className="pm-summary">
              <b>{data.unusual_count}</b> flagged unusual
              {filtersActive ? <> · <b>{rows.length}</b> match filters</> : null}
              {data.top_pick ? <> · top: <b>{data.top_pick.ticker}</b> ({data.top_pick.gap_pct >= 0 ? "+" : ""}{data.top_pick.gap_pct}%)</> : null}
            </span>
          )}
        </div>

        {error && <p className="err">Scan error: {error}</p>}
        {loading && !data && <p className="muted">Scanning ~40 large-caps…</p>}

        {data && (
          <table className="pm-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
              </tr>
              <tr className="pm-filter-row">
                {COLUMNS.map((c) => (
                  <th key={c.key}>
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
              {rows.map((r) => (
                <tr key={r.ticker} className={r.unusual ? "pm-unusual" : ""}>
                  {COLUMNS.map((c) => {
                    if (c.key === "ticker") {
                      return (
                        <td key={c.key}>
                          <button className="pm-ticker" onClick={() => onPickTicker?.(r.ticker)}>{r.ticker}</button>
                          {r.unusual ? <span className="pm-flag">⚡</span> : null}
                        </td>
                      );
                    }
                    const cls = c.classer ? c.classer(r) : "";
                    const cell = c.format(r);
                    return (
                      <td key={c.key} className={cls}
                          title={c.key === "rvol" ? r.rvol_basis : undefined}>
                        {c.key === "score" ? <b>{cell}</b> : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && !rows.length && (
          <p className="muted">
            {filtersActive
              ? "No rows match the column filters — adjust or clear them."
              : "No symbols match the current filter."}
          </p>
        )}
        {data && <p className="muted small">{data.note}</p>}
      </div>
    </div>
  );
}
