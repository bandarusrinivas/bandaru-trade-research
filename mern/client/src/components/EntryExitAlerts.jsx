export default function EntryExitAlerts({ analysis }) {
  if (!analysis) return <div className="empty">Loading…</div>;
  const recs = analysis.recommendations || [];
  const pivots = analysis.pivots || {};

  return (
    <div className="alerts-grid">
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
