import { useEffect, useState, useMemo } from "react";
import { getBacktest } from "../api.js";

// Strategy catalogue — each entry declares which inputs it actually needs, so
// the configure panel can render dynamically (only the relevant fields show).
//   needsWidth — strategy has wing legs offset from the center strike
//   needsFar   — strategy has a second (far) expiration (calendar spread)
const STRATS = [
  { key: "long_call", label: "Long Call", kind: "debit", needsWidth: false, needsFar: false,
    legs: "Buy 1 call at the strike." },
  { key: "long_put", label: "Long Put", kind: "debit", needsWidth: false, needsFar: false,
    legs: "Buy 1 put at the strike." },
  { key: "bull_call_spread", label: "Bull Call Spread", kind: "debit", needsWidth: true, needsFar: false,
    legs: "Buy 1 call at the strike, sell 1 call one wing higher." },
  { key: "bear_put_spread", label: "Bear Put Spread", kind: "debit", needsWidth: true, needsFar: false,
    legs: "Buy 1 put at the strike, sell 1 put one wing lower." },
  { key: "straddle", label: "Straddle", kind: "debit", needsWidth: false, needsFar: false,
    legs: "Buy 1 call and 1 put, both at the strike." },
  { key: "strangle", label: "Strangle", kind: "debit", needsWidth: true, needsFar: false,
    legs: "Buy 1 call one wing above and 1 put one wing below the strike." },
  { key: "iron_condor", label: "Iron Condor", kind: "credit", needsWidth: true, needsFar: false,
    legs: "Sell a put & a call one wing out each side, buy a further wing each side as protection." },
  { key: "butterfly", label: "Butterfly", kind: "debit", needsWidth: true, needsFar: false,
    legs: "Buy 1 call a wing below, sell 2 calls at the strike, buy 1 call a wing above." },
  { key: "calendar_spread", label: "Calendar Spread", kind: "debit", needsWidth: false, needsFar: true,
    legs: "Sell the near-dated call and buy the far-dated call at the same strike." },
];

const money = (v) => (v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const signed = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const addDays = (dateStr, n) => new Date(new Date(dateStr).getTime() + n * 86400000).toISOString().slice(0, 10);
const dteFrom = (from, to) => Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));

// Expiration payoff diagram — P&L vs underlying price at expiration.
function PayoffChart({ payoff, entrySpot, finalSpot, breakevens }) {
  const g = useMemo(() => {
    if (!payoff?.length) return null;
    const W = 720, H = 230, padL = 46, padR = 12, padT = 12, padB = 24;
    const prices = payoff.map((p) => p.price);
    const pnls = payoff.map((p) => p.pnl);
    const xmin = Math.min(...prices), xmax = Math.max(...prices);
    let ymin = Math.min(0, ...pnls), ymax = Math.max(0, ...pnls);
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const x = (p) => padL + ((p - xmin) / (xmax - xmin)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - ymin) / (ymax - ymin)) * (H - padT - padB);
    return {
      W, H, padL, padR, padT, padB, x, y, xmin, xmax,
      zeroY: y(0),
      line: payoff.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.price).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" "),
      ymax, ymin,
    };
  }, [payoff]);
  if (!g) return null;
  return (
    <svg className="sl-chart" viewBox={`0 0 ${g.W} ${g.H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <rect x={g.padL} y={g.padT} width={g.W - g.padL - g.padR} height={g.zeroY - g.padT} fill="rgba(38,217,110,0.07)" />
      <rect x={g.padL} y={g.zeroY} width={g.W - g.padL - g.padR} height={g.H - g.padB - g.zeroY} fill="rgba(255,122,140,0.07)" />
      <line x1={g.padL} x2={g.W - g.padR} y1={g.zeroY} y2={g.zeroY} stroke="#5a6472" strokeWidth="1" />
      <text x={4} y={g.padT + 8} fill="#26d96e" fontSize="9">{signed(g.ymax)}</text>
      <text x={4} y={g.zeroY + 3} fill="#97a1ab" fontSize="9">$0</text>
      <text x={4} y={g.H - g.padB} fill="#ff7a8c" fontSize="9">{signed(g.ymin)}</text>
      {entrySpot != null && entrySpot >= g.xmin && entrySpot <= g.xmax && (
        <g>
          <line x1={g.x(entrySpot)} x2={g.x(entrySpot)} y1={g.padT} y2={g.H - g.padB} stroke="#58a6ff" strokeWidth="1" strokeDasharray="3 3" />
          <text x={g.x(entrySpot)} y={g.H - 4} fill="#58a6ff" fontSize="9" textAnchor="middle">entry {entrySpot}</text>
        </g>
      )}
      {finalSpot != null && finalSpot >= g.xmin && finalSpot <= g.xmax && (
        <g>
          <line x1={g.x(finalSpot)} x2={g.x(finalSpot)} y1={g.padT} y2={g.H - g.padB} stroke="#f1c870" strokeWidth="1" strokeDasharray="3 3" />
          <text x={g.x(finalSpot)} y={g.padT + 8} fill="#f1c870" fontSize="9" textAnchor="middle">settle {finalSpot}</text>
        </g>
      )}
      {(breakevens || []).map((be, i) => (
        be >= g.xmin && be <= g.xmax
          ? <circle key={i} cx={g.x(be)} cy={g.zeroY} r="3" fill="#e6edf3" /> : null
      ))}
      <path d={g.line} fill="none" stroke="#58a6ff" strokeWidth="2" />
    </svg>
  );
}

// Day-by-day marked P&L from entry to expiration.
function PnlPathChart({ path }) {
  const g = useMemo(() => {
    if (!path || path.length < 2) return null;
    const W = 720, H = 150, padL = 46, padR = 12, padT = 10, padB = 12;
    const pnls = path.map((p) => p.pnl);
    let ymin = Math.min(0, ...pnls), ymax = Math.max(0, ...pnls);
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const x = (i) => padL + (i / (path.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - ymin) / (ymax - ymin)) * (H - padT - padB);
    return {
      W, H, padL, padR, padB, padT, zeroY: y(0), ymin, ymax,
      line: path.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" "),
    };
  }, [path]);
  if (!g) return null;
  return (
    <svg className="sl-chart" viewBox={`0 0 ${g.W} ${g.H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <line x1={g.padL} x2={g.W - g.padR} y1={g.zeroY} y2={g.zeroY} stroke="#5a6472" strokeWidth="1" />
      <text x={4} y={g.padT + 8} fill="#26d96e" fontSize="9">{signed(g.ymax)}</text>
      <text x={4} y={g.H - g.padB} fill="#ff7a8c" fontSize="9">{signed(g.ymin)}</text>
      <path d={g.line} fill="none" stroke="#26d96e" strokeWidth="2" />
    </svg>
  );
}

// ─────────────────────── Strategy Backtest (dynamic) ───────────────────────
// Pick a strategy and the configure panel adapts: only the fields that
// strategy actually needs are shown (wing width / far expiry appear only when
// relevant), with a description of the strategy's legs. The modelled premium,
// payoff and outcome populate live (debounced auto-run).
export default function StrategyLab({ ticker }) {
  const [strategy, setStrategy] = useState("long_call");
  const [entryDate, setEntryDate] = useState(() => daysAgo(35));
  const [expiry, setExpiry] = useState(() => addDays(daysAgo(35), 21));
  const [farExpiry, setFarExpiry] = useState(() => addDays(daysAgo(35), 45));
  const [centerStrike, setCenterStrike] = useState("");
  const [width, setWidth] = useState("");
  const [premium, setPremium] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const strat = STRATS.find((s) => s.key === strategy) || STRATS[0];
  const needsWidth = strat.needsWidth;
  const needsFar = strat.needsFar;

  const run = () => {
    setLoading(true);
    getBacktest({
      ticker, mode: "strategy", strategy, entry_date: entryDate,
      center_strike: centerStrike || undefined,
      width: needsWidth ? (width || undefined) : undefined,
      dte: dteFrom(entryDate, expiry),
      far_dte: needsFar ? dteFrom(entryDate, farExpiry) : undefined,
      premium: premium || undefined,
    })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { setData(null); setError(e.response?.data?.error || e.message); })
      .finally(() => setLoading(false));
  };

  // Auto-recompute (debounced) whenever any input changes.
  useEffect(() => {
    const id = setTimeout(run, 400);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [ticker, strategy, entryDate, expiry, farExpiry, centerStrike, width, premium]);

  const o = data?.outcome || {};
  const kind = data?.kind || strat.kind;

  return (
    <div className="strategy-lab">
      {/* ── configure the trade — fields adapt to the chosen strategy ── */}
      <div className="sl-config">
        <div className="sl-cfg-strats">
          {STRATS.map((s) => (
            <button key={s.key} className={strategy === s.key ? "active" : ""}
                    onClick={() => setStrategy(s.key)}>{s.label}</button>
          ))}
        </div>

        {/* strategy-specific description + which inputs it needs */}
        <div className="sl-strat-info">
          <span className={`sl-kind sl-${strat.kind}`}>{strat.kind === "credit" ? "NET CREDIT" : "NET DEBIT"}</span>
          <span className="sl-strat-legs">{strat.legs}</span>
          <span className="sl-strat-needs">
            Needs: strike{needsWidth ? " · wing width" : ""} · expiry{needsFar ? " · far expiry" : ""}
          </span>
        </div>

        {/* dynamic field grid — only the fields this strategy uses are shown */}
        <div className="sl-cfg-grid">
          <label>Entry date
            <input type="date" value={entryDate} max={daysAgo(1)} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label>{needsFar ? "Near expiry" : "Expiry date"}
            <input type="date" value={expiry} min={entryDate} onChange={(e) => setExpiry(e.target.value)} />
          </label>
          {needsFar && (
            <label>Far expiry
              <input type="date" value={farExpiry} min={expiry} onChange={(e) => setFarExpiry(e.target.value)} />
            </label>
          )}
          <label>{needsWidth ? "Center strike" : "Strike"}
            <input type="number" value={centerStrike}
                   placeholder={data ? `ATM (${data.center_strike})` : "ATM"}
                   onChange={(e) => setCenterStrike(e.target.value)} />
          </label>
          {needsWidth && (
            <label>Wing width $
              <input type="number" value={width}
                     placeholder={data ? String(data.width) : "auto"}
                     onChange={(e) => setWidth(e.target.value)} />
            </label>
          )}
        </div>

        <div className={`sl-prem ${kind}`}>
          <div className="sl-prem-modeled">
            <span className="k">Modeled net {kind}</span>
            <span className="v">{data ? `$${data.modeled_premium}` : "—"} <small>/ share</small></span>
            <span className="sub">
              {data ? `${money(data.modeled_premium * 100)} per spread` : "—"} · IV {data?.iv_used ?? "—"}%
            </span>
          </div>
          <label className="sl-prem-override">
            Override net premium / share
            <input type="number" step="0.01" value={premium}
                   placeholder={data ? `modeled ${data.modeled_premium}` : "modeled"}
                   onChange={(e) => setPremium(e.target.value)} />
          </label>
          <span className="sl-prem-basis">
            {loading ? "computing…"
              : premium ? "using your override premium"
              : "premium auto-populated from ticker · strikes · expiry"}
          </span>
        </div>
      </div>

      {error && <p className="err">Scenario error: {error}</p>}
      {!data && !error && <p className="muted">Modeling the strategy…</p>}

      {data && !error && (
        <>
          <div className={`sl-outcome ${o.final_pnl >= 0 ? "up" : "down"}`}>
            <div className="sl-outcome-head">
              <span className="sl-strat">{data.strategy_label}</span>
              <span className={`sl-kind sl-${data.kind}`}>{data.kind === "credit" ? "NET CREDIT" : "NET DEBIT"}</span>
              <span className="muted small">{data.ticker} · entry {data.entry_date} @ ${data.entry_spot} · exp {data.expiration_date}</span>
            </div>
            <div className="sl-outcome-pnl">{signed(o.final_pnl)}</div>
            <div className="muted small">{o.status}</div>
          </div>

          <div className="bt-stats">
            <div className="bt-stat"><span className="k">Net {data.kind}</span><span className="v">{money(data.net_premium_per_contract)}</span><span className="sub">{data.premium_basis === "override" ? "your premium" : "modeled"} · ${data.net_premium}/share</span></div>
            <div className="bt-stat"><span className="k">Max profit</span><span className="v up">{data.profit_uncapped ? "uncapped" : signed(data.max_profit)}</span></div>
            <div className="bt-stat"><span className="k">Max loss</span><span className="v down">{signed(data.max_loss)}</span></div>
            <div className="bt-stat"><span className="k">Breakeven</span><span className="v">{data.breakevens?.length ? data.breakevens.map((b) => `$${b}`).join(" / ") : "—"}</span></div>
            <div className="bt-stat"><span className="k">Entry spot</span><span className="v">${data.entry_spot}</span></div>
            <div className="bt-stat"><span className="k">Settle spot</span><span className="v">${o.final_spot}</span></div>
            <div className="bt-stat"><span className="k">IV used</span><span className="v">{data.iv_used}%</span></div>
            <div className="bt-stat"><span className="k">Width / DTE</span><span className="v">${data.width} / {data.dte}d{data.far_dte ? ` · far ${data.far_dte}d` : ""}</span></div>
          </div>

          <h4 className="bt-sub">Legs</h4>
          <div className="bt-trades-wrap">
            <table className="bt-trades">
              <thead>
                <tr><th>#</th><th>Action</th><th>Type</th><th>Strike</th><th>Qty</th><th>Expiration</th><th>Entry premium</th></tr>
              </thead>
              <tbody>
                {(data.legs || []).map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className={l.action === "buy" ? "up" : "down"}>{l.action.toUpperCase()}</td>
                    <td>{l.type.toUpperCase()}</td>
                    <td><b>{l.strike}</b></td>
                    <td>{l.qty}</td>
                    <td>{l.expiration}</td>
                    <td>${l.entry_premium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="bt-sub">Expiration payoff — P&amp;L vs underlying price</h4>
          <PayoffChart payoff={data.payoff_curve} entrySpot={data.entry_spot}
                       finalSpot={o.final_spot} breakevens={data.breakevens} />

          <h4 className="bt-sub">Marked P&amp;L — entry to expiration</h4>
          <PnlPathChart path={data.path} />

          <p className="muted small">{data.note}</p>
        </>
      )}
    </div>
  );
}
