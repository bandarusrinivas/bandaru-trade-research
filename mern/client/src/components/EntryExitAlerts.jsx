const money = (v) =>
  v == null ? "—" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One projected-levels block — next day or next week.
function ForwardBlock({ title, sub, lv }) {
  if (!lv) return null;
  return (
    <div className="eea-fwd">
      <div className="eea-fwd-head">
        <span className="eea-fwd-title">{title}</span>
        <span className="muted small">{sub}</span>
      </div>
      <p className="eea-fwd-sentence">
        Strong support <b className="down">{money(lv.strong_support)}</b>
        {" "}· likely target <b className="up">{money(lv.target)}</b>
        {" "}· next level <b className="up">{money(lv.next_level)}</b>
      </p>
      <div className="eea-fwd-rows">
        <div className="eea-lv up"><span>Next level (R2)</span><b>{money(lv.next_level)}</b></div>
        <div className="eea-lv up"><span>Likely target (R1)</span><b>{money(lv.target)}</b></div>
        <div className="eea-lv piv"><span>Pivot</span><b>{money(lv.pivot)}</b></div>
        <div className="eea-lv down"><span>Strong support (S1)</span><b>{money(lv.strong_support)}</b></div>
        <div className="eea-lv down"><span>Major support (S2)</span><b>{money(lv.major_support)}</b></div>
      </div>
    </div>
  );
}

export default function EntryExitAlerts({ analysis }) {
  if (!analysis) return <div className="empty">Loading…</div>;
  const recs = analysis.recommendations || [];
  const pivots = analysis.pivots || {};
  const fl = analysis.forward_levels;
  const ticker = analysis.ticker || "";

  return (
    <div className="alerts-grid">
      {fl && (
        <div className="card eea-forward">
          <h2>Projected Levels — {ticker} · Next Day &amp; Next Week</h2>
          <div className="eea-fwd-grid">
            <ForwardBlock title="Next Trading Day"
                          sub={`projected from ${fl.next_day?.source_date || "—"}`}
                          lv={fl.next_day} />
            <ForwardBlock title="Next Week"
                          sub={`projected from ${fl.next_week?.source_week || "—"}`}
                          lv={fl.next_week} />
          </div>
          <p className="muted small">
            Floor-trader pivot projection from the last completed day / week —
            modelled support &amp; resistance levels for planning, not a forecast.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Support / Resistance — Classic Pivots</h2>
        <ul className="pivot-list">
          {Object.entries(pivots).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <li key={k} className={k === "PP" ? "pp" : k.startsWith("R") ? "resistance" : "support"}>
              <span className="label">{k}</span>
              <span className="value">{v.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Suggested 0DTE Trades</h2>
        {!recs.length ? (
          <div className="empty">No setups triggered right now.</div>
        ) : (
          recs.map((r) => (
            <div key={r.id} className={`rec rec-${r.direction}`}>
              <div className="rec-head">
                <span className={`badge ${r.direction}`}>{r.type}</span>
                <strong>{r.strategy}</strong>
              </div>
              <div className="rec-body">
                <div><b>Strike:</b> {r.strike} @ ${r.current_premium}</div>
                <div><b>Entry:</b> {r.entry_trigger}</div>
                <div className="up"><b>Target:</b> ${r.profit_target_spy} → ${r.profit_target_premium}</div>
                <div className="down"><b>Stop:</b> ${r.stop_loss_spy} → ${r.stop_loss_premium}</div>
                <div className="muted">{r.reasoning}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
