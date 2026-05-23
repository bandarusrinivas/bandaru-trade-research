import { useEffect, useState, useMemo } from "react";
import { getBacktest } from "../api.js";

const fmtMoney = (v) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`);

const EQUITY_STRATEGIES = {
  ema_cross: "EMA 8 / 21 cross", rsi_reversal: "RSI(14) reversal",
  macd: "MACD histogram flip", squeeze: "TTM squeeze fire",
  pivot_breakout: "Daily pivot breakout",
};
const DTES = [0, 1, 3, 7, 14, 30];
const OFFSETS = [-2, -1, 0, 1, 2, 3, 5];
const TS_PRESETS = [
  { label: "+50 / −50", t: 0.5, s: 0.5 },
  { label: "+100 / −50", t: 1.0, s: 0.5 },
  { label: "+30 / −40", t: 0.3, s: 0.4 },
  { label: "+100 / −70", t: 1.0, s: 0.7 },
];
const offsetLabel = (o) => (o === 0 ? "ATM" : o > 0 ? `+${o} OTM` : `${o} ITM`);

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

export default function Backtest({ ticker }) {
  const [mode, setMode] = useState(() => localStorage.getItem("bandaru_bt_mode") || "options");

  // shared
  const [strategy, setStrategy] = useState("ema_cross");
  // equity
  const [period, setPeriod] = useState("2y");
  // options
  const [side, setSide] = useState("both");
  const [dte, setDte] = useState(7);
  const [strikeOffset, setStrikeOffset] = useState(0);
  const [exitRule, setExitRule] = useState("target_stop");
  const [tsIdx, setTsIdx] = useState(0);
  const [lookback, setLookback] = useState("2mo");

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { localStorage.setItem("bandaru_bt_mode", mode); }, [mode]);

  const run = () => {
    setLoading(true); setError(null);
    const params = mode === "options"
      ? { ticker, mode: "option", strategy, side, dte, strike_offset: strikeOffset,
          exit: exitRule, target_pct: TS_PRESETS[tsIdx].t, stop_pct: TS_PRESETS[tsIdx].s, lookback }
      : { ticker, mode: "equity", strategy, period };
    getBacktest(params)
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  // auto-run when ticker / mode / any control changes
  useEffect(() => { run(); /* eslint-disable-next-line */ },
    [ticker, mode, strategy, period, side, dte, strikeOffset, exitRule, tsIdx, lookback]);

  const s = data?.stats || {};
  const isOpt = mode === "options";

  return (
    <div className="backtest-page">
      <div className="card">
        <div className="profile-card-head">
          <h2>Strategy Backtest — {ticker}</h2>
          <div className="control-group bt-mode">
            <button className={mode === "options" ? "active" : ""} onClick={() => setMode("options")}>🎲 Options</button>
            <button className={mode === "equity" ? "active" : ""} onClick={() => setMode("equity")}>📈 Equity</button>
          </div>
        </div>

        {/* ── controls ── */}
        <div className="bt-controls">
          <div className="bt-field">
            <label>Signal</label>
            <div className="control-group bt-strats">
              {Object.entries(EQUITY_STRATEGIES).map(([k, label]) => (
                <button key={k} className={strategy === k ? "active" : ""} onClick={() => setStrategy(k)}>{label}</button>
              ))}
            </div>
          </div>

          {isOpt ? (
            <>
              <div className="bt-field">
                <label>Side</label>
                <div className="control-group">
                  {[["both", "Calls + Puts"], ["call", "Calls only"], ["put", "Puts only"]].map(([k, l]) => (
                    <button key={k} className={side === k ? "active" : ""} onClick={() => setSide(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="bt-field">
                <label>DTE</label>
                <div className="control-group">
                  {DTES.map((d) => (
                    <button key={d} className={dte === d ? "active" : ""} onClick={() => setDte(d)}>{d === 0 ? "0DTE" : d}</button>
                  ))}
                </div>
              </div>
              <div className="bt-field">
                <label>Strike (call = spot+offset, put = spot−offset)</label>
                <div className="control-group">
                  {OFFSETS.map((o) => (
                    <button key={o} className={strikeOffset === o ? "active" : ""} onClick={() => setStrikeOffset(o)}>{offsetLabel(o)}</button>
                  ))}
                </div>
              </div>
              <div className="bt-field">
                <label>Exit rule</label>
                <div className="control-group">
                  {[["target_stop", "Target / Stop"], ["signal", "Signal"], ["expiration", "Expiration"]].map(([k, l]) => (
                    <button key={k} className={exitRule === k ? "active" : ""} onClick={() => setExitRule(k)}>{l}</button>
                  ))}
                </div>
              </div>
              {exitRule === "target_stop" && (
                <div className="bt-field">
                  <label>Target / Stop (% of premium)</label>
                  <div className="control-group">
                    {TS_PRESETS.map((p, i) => (
                      <button key={p.label} className={tsIdx === i ? "active" : ""} onClick={() => setTsIdx(i)}>{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="bt-field">
                <label>Lookback</label>
                <div className="control-group">
                  {["1mo", "2mo", "3mo"].map((p) => (
                    <button key={p} className={lookback === p ? "active" : ""} onClick={() => setLookback(p)}>{p}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bt-field">
              <label>Period</label>
              <div className="control-group">
                {["1y", "2y", "5y"].map((p) => (
                  <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}
          <button className="bt-run" onClick={run}>{loading ? "Running…" : "Re-run"}</button>
        </div>

        {error && <p className="err">Backtest error: {error}</p>}
        {loading && !data && <p className="muted">Running backtest…</p>}

        {data && (
          <>
            {/* ── stats ── */}
            <div className="bt-stats">
              <div className={`bt-stat big ${s.total_return_pct >= 0 ? "up" : "down"}`}>
                <span className="k">{isOpt ? "Option strategy return" : "Strategy return"}</span>
                <span className="v">{fmtPct(s.total_return_pct)}</span>
                <span className="sub">{fmtMoney(s.start_equity)} → {fmtMoney(s.final_equity)}</span>
              </div>
              <div className="bt-stat">
                <span className="k">Underlying buy &amp; hold</span>
                <span className={`v ${s.buy_hold_return_pct >= 0 ? "up" : "down"}`}>{fmtPct(s.buy_hold_return_pct)}</span>
              </div>
              <div className="bt-stat"><span className="k">Win rate</span><span className="v">{s.win_rate_pct != null ? `${s.win_rate_pct}%` : "—"}</span><span className="sub">{s.wins}W / {s.losses}L</span></div>
              <div className="bt-stat"><span className="k">Profit factor</span><span className="v">{s.profit_factor ?? "—"}</span></div>
              <div className="bt-stat"><span className="k">Max drawdown</span><span className="v down">{fmtPct(s.max_drawdown_pct)}</span></div>
              <div className="bt-stat"><span className="k">Trades</span><span className="v">{s.trades}</span></div>
              <div className="bt-stat"><span className="k">Avg win / loss</span><span className="v">{fmtPct(s.avg_win_pct)} / {fmtPct(s.avg_loss_pct)}</span></div>
              {isOpt && (
                <>
                  <div className="bt-stat"><span className="k">Calls</span><span className="v up">{s.calls?.win_rate_pct != null ? `${s.calls.win_rate_pct}%` : "—"}</span><span className="sub">{s.calls?.trades || 0} trades · avg {fmtPct(s.calls?.avg_return_pct)}</span></div>
                  <div className="bt-stat"><span className="k">Puts</span><span className="v down">{s.puts?.win_rate_pct != null ? `${s.puts.win_rate_pct}%` : "—"}</span><span className="sub">{s.puts?.trades || 0} trades · avg {fmtPct(s.puts?.avg_return_pct)}</span></div>
                  <div className="bt-stat"><span className="k">Avg days held</span><span className="v">{s.avg_days_held ?? "—"}</span></div>
                  <div className="bt-stat"><span className="k">Expired worthless</span><span className="v">{s.expired_worthless ?? 0}</span></div>
                </>
              )}
              {!isOpt && (
                <div className="bt-stat"><span className="k">CAGR</span><span className="v">{fmtPct(s.cagr_pct)}</span></div>
              )}
            </div>

            <h4 className="bt-sub">Equity curve — <span className="bt-leg-strat">strategy</span> vs <span className="bt-leg-bench">underlying buy &amp; hold</span></h4>
            <EquityChart strat={data.equity_curve} bench={data.benchmark_curve} />

            <h4 className="bt-sub">Trades ({data.trades?.length || 0})</h4>
            <div className="bt-trades-wrap">
              {isOpt ? (
                <table className="bt-trades">
                  <thead>
                    <tr>
                      <th>#</th><th>Side</th><th>Entry</th><th>Undl</th><th>Strike</th>
                      <th>DTE</th><th>IV</th><th>Entry $</th><th>Exit</th><th>Undl</th>
                      <th>Exit $</th><th>Days</th><th>Return</th><th>P&amp;L</th><th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.trades || []).map((t, i) => (
                      <tr key={i} className={t.return_pct >= 0 ? "bt-win" : "bt-loss"}>
                        <td>{i + 1}</td>
                        <td className={t.is_call ? "up" : "down"}>{t.side}</td>
                        <td>{t.entry_date}</td>
                        <td>${t.underlying_entry}</td>
                        <td><b>{t.strike}</b></td>
                        <td>{t.dte}</td>
                        <td>{t.iv_used}%</td>
                        <td>${t.entry_premium}</td>
                        <td>{t.exit_date}</td>
                        <td>${t.underlying_exit}</td>
                        <td>${t.exit_premium}</td>
                        <td>{t.days_held}</td>
                        <td className={t.return_pct >= 0 ? "up" : "down"}>{fmtPct(t.return_pct)}</td>
                        <td className={t.pnl >= 0 ? "up" : "down"}>{fmtMoney(t.pnl)}</td>
                        <td className="muted small">{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
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
              )}
              {!data.trades?.length && <p className="muted">No trades triggered for these settings.</p>}
            </div>

            <p className="muted small">{data.note}</p>
          </>
        )}
      </div>
    </div>
  );
}
