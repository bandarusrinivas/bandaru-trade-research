import { useEffect, useState } from "react";
import { getOIFlow } from "../api.js";

const sign = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function OITable({ title, rows, optType }) {
  if (!rows?.length) return null;
  const shown = rows.filter((r) => r.oi_change !== 0).slice(0, 12);
  return (
    <div className="oi-table-wrap">
      <h4>{title}</h4>
      <table className="oi-table">
        <thead>
          <tr>
            <th>Strike</th><th>Prior OI</th><th>Today OI</th>
            <th>Δ OI</th><th>Δ %</th><th>Today Vol</th><th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={`${optType}-${r.strike}`} className={r.bullish_accum ? "oi-bullish" : ""}>
              <td><b>{r.strike}</b></td>
              <td>{r.prior_oi.toLocaleString()}</td>
              <td>{r.today_oi.toLocaleString()}</td>
              <td className={r.oi_change > 0 ? "up" : r.oi_change < 0 ? "down" : ""}>{sign(r.oi_change)}</td>
              <td className={r.oi_change > 0 ? "up" : r.oi_change < 0 ? "down" : ""}>
                {r.oi_change_pct != null ? `${r.oi_change_pct > 0 ? "+" : ""}${r.oi_change_pct}%` : "—"}
              </td>
              <td>{r.today_volume.toLocaleString()}</td>
              <td className="oi-signal">{r.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OIFlow({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let on = true;
    setLoading(true); setError(null);
    getOIFlow(ticker)
      .then((d) => on && setData(d))
      .catch((e) => on && setError(e.response?.data?.error || e.message))
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Loading OI flow…</p></div>;
  if (error)            return <div className="card"><p className="err">OI flow: {error}</p></div>;
  if (!data)            return null;

  if (data.baseline || data.available === false) {
    return (
      <div className="card oi-flow">
        <h3>Open Interest Flow — Calls</h3>
        <p className="muted">{data.note}</p>
        {data.contracts_captured ? (
          <p className="muted small">Captured {data.contracts_captured} contracts · spot ${data.spot?.toFixed(2)}</p>
        ) : null}
      </div>
    );
  }

  const s = data.summary || {};
  const up = (data.price_change ?? 0) >= 0;

  return (
    <div className="card oi-flow">
      <div className="profile-card-head">
        <h3>Open Interest Flow — Calls &amp; Puts</h3>
        <span className="muted small">{data.prior_date} → {data.today_date}</span>
      </div>

      <div className="oi-headline">
        <p><b>{s.headline}</b></p>
      </div>

      <div className="oi-stats">
        <div className="stat"><span className="k">Price move</span>
          <span className={`v ${up ? "up" : "down"}`}>
            {up ? "+" : ""}{data.price_change} ({data.price_change_pct}%)
          </span>
        </div>
        <div className="stat"><span className="k">Call OI added</span><span className="v up">+{(s.call_oi_added || 0).toLocaleString()}</span></div>
        <div className="stat"><span className="k">Call OI removed</span><span className="v down">{(s.call_oi_removed || 0).toLocaleString()}</span></div>
        <div className="stat"><span className="k">Net call ΔOI</span>
          <span className={`v ${(s.net_call_oi_change || 0) >= 0 ? "up" : "down"}`}>{sign(s.net_call_oi_change || 0)}</span>
        </div>
        <div className="stat"><span className="k">Net put ΔOI</span>
          <span className={`v ${(s.net_put_oi_change || 0) >= 0 ? "up" : "down"}`}>{sign(s.net_put_oi_change || 0)}</span>
        </div>
        <div className="stat"><span className="k">Bullish-accum strikes</span><span className="v">{s.bullish_accum_strikes || 0}</span></div>
      </div>

      <OITable title="Call strikes — biggest OI gains first (▢ green = OI↑ with price↑)" rows={data.calls} optType="call" />
      <OITable title="Put strikes — OI change" rows={data.puts} optType="put" />

      <p className="muted small">{data.note}</p>
    </div>
  );
}
