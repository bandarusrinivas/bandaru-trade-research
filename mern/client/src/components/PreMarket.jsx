import { useEffect, useState } from "react";
import { getPremarket } from "../api.js";

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

export default function PreMarket({ onPickTicker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlyUnusual, setOnlyUnusual] = useState(false);

  const scan = () => {
    setLoading(true); setError(null);
    getPremarket()
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { scan(); }, []);

  const rows = (data?.results || []).filter((r) => !onlyUnusual || r.unusual);

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
          {data && (
            <span className="pm-summary">
              <b>{data.unusual_count}</b> flagged unusual
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
                <th>Ticker</th><th>Price</th><th>Gap %</th><th>RVOL</th>
                <th>Vol today</th><th>Avg vol</th><th>Day range</th>
                <th>Bias</th><th>ATM</th><th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className={r.unusual ? "pm-unusual" : ""}>
                  <td>
                    <button className="pm-ticker" onClick={() => onPickTicker?.(r.ticker)}>{r.ticker}</button>
                    {r.unusual ? <span className="pm-flag">⚡</span> : null}
                  </td>
                  <td>${r.price?.toFixed(2)}</td>
                  <td className={r.gap_pct >= 0 ? "up" : "down"}>{r.gap_pct >= 0 ? "+" : ""}{r.gap_pct}%</td>
                  <td className={rvolClass(r.rvol)} title={r.rvol_basis}>
                    {r.rvol != null ? `${r.rvol}×` : "—"}
                  </td>
                  <td>{fmtVol(r.day_volume)}</td>
                  <td>{fmtVol(r.avg_volume)}</td>
                  <td>{r.day_range_pct != null ? `${r.day_range_pct}%` : "—"}</td>
                  <td className={r.bias === "calls" ? "up" : r.bias === "puts" ? "down" : "muted"}>{r.bias}</td>
                  <td>{r.atm_strike}</td>
                  <td><b>{r.score}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && !rows.length && <p className="muted">No symbols match the current filter.</p>}
        {data && <p className="muted small">{data.note}</p>}
      </div>
    </div>
  );
}
