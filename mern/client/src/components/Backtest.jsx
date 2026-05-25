import { useEffect, useState, useMemo } from "react";
import { getBacktest } from "../api.js";
import StrategyLab from "./StrategyLab.jsx";

const fmtMoney = (v) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`);

const EQUITY_STRATEGIES = {
  ema_cross: "EMA 8 / 21 cross", rsi_reversal: "RSI(14) reversal",
  macd: "MACD histogram flip", squeeze: "TTM squeeze fire",
  pivot_breakout: "Daily pivot breakout",
};

// Two-line equity curve: strategy (green) vs buy & hold (grey dashed).
function EquityChart({ strat, bench }) {
  const geo = useMemo(() => {
    if (!strat?.length) return null;
    const W = 760, H = 240, padL = 8, padR = 8, padT = 10, padB = 22;
    const all = [...strat, ...(bench || [])].map((p) => p.equity).filter((v) => v != null);
    if (!all.length) return null;
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo === hi) { lo -= 1; hi += 1; }
    const n = strat.length;
    const x = (i) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const path = (arr) => arr.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
    return { W, H, y, lo, hi, stratPath: path(strat), benchPath: bench?.length ? path(bench) : null };
  }, [strat, bench]);
  if (!geo) return null;
  const ticks = [geo.lo, (geo.lo + geo.hi) / 2, geo.hi];
  return (
    <svg className="bt-equity" viewBox={`0 0 ${geo.W} ${geo.H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={0} x2={geo.W} y1={geo.y(t)} y2={geo.y(t)} stroke="#2a313a" strokeWidth="1" />
          <text x={4} y={geo.y(t) - 3} fill="#97a1ab" fontSize="9">${Math.round(t).toLocaleString()}</text>
        </g>
      ))}
      {geo.benchPath && <path d={geo.benchPath} fill="none" stroke="#7f8a97" strokeWidth="1.5" strokeDasharray="4 3" />}
      <path d={geo.stratPath} fill="none" stroke="#26d96e" strokeWidth="2" />
    </svg>
  );
}

function EquityMode({ ticker }) {
  const [strategy, setStrategy] = useState("ema_cross");
  const [period, setPeriod] = useState("2y");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true); setError(null);
    getBacktest({ ticker, mode: "equity", strategy, period })
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { run(); /* eslint-disable-next-line */ }, [ticker, strategy, period]);

  const s = data?.stats || {};
  return (
    <>
      <div className="bt-controls">
        <div className="bt-field">
          <label>Signal</label>
          <div className="control-group bt-strats">
            {Object.entries(EQUITY_STRATEGIES).map(([k, label]) => (
              <button key={k} className={strategy === k ? "active" : ""} onClick={() => setStrategy(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="bt-field">
          <label>Period</label>
          <div className="control-group">
            {["1y", "2y", "5y"].map((p) => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <button className="bt-run" onClick={run}>{loading ? "Running…" : "Re-run"}</button>
        </div>
      </div>

      {error && <p className="err">Backtest error: {error}</p>}
      {loading && !data && <p className="muted">Running backtest…</p>}

      {data && (
        <>
          <div className="bt-stats">
            <div className={`bt-stat big ${s.total_return_pct >= 0 ? "up" : "down"}`}>
              <span className="k">Strategy return</span>
              <span className="v">{fmtPct(s.total_return_pct)}</span>
              <span className="sub">{fmtMoney(s.start_equity)} → {fmtMoney(s.final_equity)}</span>
            </div>
            <div className="bt-stat">
              <span className="k">Buy &amp; hold</span>
              <span className={`v ${s.buy_hold_return_pct >= 0 ? "up" : "down"}`}>{fmtPct(s.buy_hold_return_pct)}</span>
            </div>
            <div className="bt-stat"><span className="k">CAGR</span><span className="v">{fmtPct(s.cagr_pct)}</span></div>
            <div className="bt-stat"><span className="k">Win rate</span><span className="v">{s.win_rate_pct != null ? `${s.win_rate_pct}%` : "—"}</span><span className="sub">{s.wins}W / {s.losses}L</span></div>
            <div className="bt-stat"><span className="k">Profit factor</span><span className="v">{s.profit_factor ?? "—"}</span></div>
            <div className="bt-stat"><span className="k">Max drawdown</span><span className="v down">{fmtPct(s.max_drawdown_pct)}</span></div>
            <div className="bt-stat"><span className="k">Trades</span><span className="v">{s.trades}</span><span className="sub">{s.exposure_pct}% exposure</span></div>
            <div className="bt-stat"><span className="k">Avg win / loss</span><span className="v">{fmtPct(s.avg_win_pct)} / {fmtPct(s.avg_loss_pct)}</span></div>
          </div>

          <h4 className="bt-sub">Equity curve — <span className="bt-leg-strat">strategy</span> vs <span className="bt-leg-bench">buy &amp; hold</span></h4>
          <EquityChart strat={data.equity_curve} bench={data.benchmark_curve} />

          <h4 className="bt-sub">Trades ({data.trades?.length || 0})</h4>
          <div className="bt-trades-wrap">
            <table className="bt-trades">
              <thead>
                <tr><th>#</th><th>Entry</th><th>Px</th><th>Exit</th><th>Px</th><th>Bars</th><th>Return</th><th>P&amp;L</th><th>Why</th></tr>
              </thead>
              <tbody>
                {(data.trades || []).map((t, i) => (
                  <tr key={i} className={t.return_pct >= 0 ? "bt-win" : "bt-loss"}>
                    <td>{i + 1}</td>
                    <td>{t.entry_date}</td><td>${t.entry_price}</td>
                    <td>{t.exit_date}</td><td>${t.exit_price}</td>
                    <td>{t.bars_held}</td>
                    <td className={t.return_pct >= 0 ? "up" : "down"}>{fmtPct(t.return_pct)}</td>
                    <td className={t.pnl >= 0 ? "up" : "down"}>{fmtMoney(t.pnl)}</td>
                    <td className="muted small">{t.exit_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.trades?.length && <p className="muted">No trades triggered for these settings.</p>}
          </div>
          <p className="muted small">{data.note}</p>
        </>
      )}
    </>
  );
}

export default function Backtest({ ticker }) {
  const [mode, setMode] = useState(() => localStorage.getItem("bandaru_bt_mode") || "strategy");
  useEffect(() => { localStorage.setItem("bandaru_bt_mode", mode); }, [mode]);

  return (
    <div className="backtest-page">
      <div className="card">
        <div className="profile-card-head">
          <h2>Backtest — {ticker}</h2>
          <div className="control-group bt-mode">
            <button className={mode === "strategy" ? "active" : ""} onClick={() => setMode("strategy")}>🧩 Strategy</button>
            <button className={mode === "equity" ? "active" : ""} onClick={() => setMode("equity")}>📈 Equity</button>
          </div>
        </div>
        {mode === "strategy" ? <StrategyLab ticker={ticker} /> : <EquityMode ticker={ticker} />}
      </div>
    </div>
  );
}
