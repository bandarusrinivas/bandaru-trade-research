import { useEffect, useState } from "react";
import { getPivotStops } from "../api.js";

const px = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

function HoldBar({ pct }) {
  if (pct == null) return <span className="muted">no tests</span>;
  const cls = pct >= 65 ? "hold-strong" : pct >= 45 ? "hold-mixed" : "hold-weak";
  return (
    <div className="hold-bar-wrap">
      <div className="hold-bar-bg">
        <div className={`hold-bar ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="hold-bar-num">{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function PivotStops({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let on = true;
    setLoading(true); setError(null);
    getPivotStops(ticker)
      .then((d) => on && setData(d))
      .catch((e) => on && setError(e.response?.data?.error || e.message))
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Loading pivot stops…</p></div>;
  if (error)            return <div className="card"><p className="err">Pivot stops error: {error}</p></div>;
  if (!data)            return null;

  const ls = data.long_stop || {};
  const ss = data.short_stop || {};
  const v = data.validation || {};

  return (
    <div className="card pivot-stops">
      <div className="profile-card-head">
        <h3>Pivot Stop Ladder &amp; Support Validation</h3>
        <span className="muted small">
          {data.ticker} {px(data.price)} · ATR(14) {data.atr_14} · buffer {px(data.buffer)}
        </span>
      </div>

      <div className="ps-now">
        <div className="ps-stat">
          <span className="k">Current zone</span>
          <span className="v">{data.current_zone}</span>
        </div>
        <div className="ps-stat">
          <span className="k">Long stop</span>
          <span className="v up">{px(ls.stop_price)}</span>
          <span className="sub">{ls.anchor ? `under ${ls.anchor} · risk ${ls.risk_pct}%` : ls.note}</span>
        </div>
        <div className="ps-stat">
          <span className="k">Short stop</span>
          <span className="v down">{px(ss.stop_price)}</span>
          <span className="sub">{ss.anchor ? `over ${ss.anchor} · risk ${ss.risk_pct}%` : ss.note}</span>
        </div>
      </div>

      <div className="ps-ladder">
        <h4>Trailing-stop ladder (long) — stop ratchets up as price clears each pivot</h4>
        <table className="ps-table">
          <thead>
            <tr><th>Price zone</th><th>Stop anchor</th><th>Long stop</th></tr>
          </thead>
          <tbody>
            {[...(data.ladder || [])].reverse().map((row) => (
              <tr key={row.zone} className={row.current ? "ps-current" : ""}>
                <td>{row.zone}{row.current ? <span className="ps-here"> ◀ price here</span> : null}</td>
                <td>{row.lower_level} {px(row.lower_value)}</td>
                <td className="up">{px(row.long_stop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ps-validation">
        <h4>Level reliability — last {v.lookback_sessions} sessions</h4>
        <table className="ps-table">
          <thead>
            <tr>
              <th>Level</th><th>Role</th><th>Value</th>
              <th>Tests</th><th>Hold rate</th><th>Avg wick through</th>
            </tr>
          </thead>
          <tbody>
            {(v.levels || []).map((l) => (
              <tr key={l.level}>
                <td><b>{l.level}</b></td>
                <td className={l.role === "support" ? "up" : "down"}>{l.role}</td>
                <td>{px(l.current_value)}</td>
                <td>{l.tests}</td>
                <td><HoldBar pct={l.hold_rate_pct} /></td>
                <td>{l.avg_wick_through != null ? px(l.avg_wick_through) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">{v.note}</p>
      </div>
    </div>
  );
}
