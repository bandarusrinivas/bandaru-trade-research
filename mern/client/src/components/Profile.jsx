import { useEffect, useState } from "react";
import { getProfile } from "../api.js";
import GammaExposure from "./GammaExposure.jsx";

function fmtPrice(v) { return v == null ? "—" : `$${v.toFixed(2)}`; }
function fmtPct(v)   { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtBn(v) {
  if (v == null) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6)  return (v / 1e6).toFixed(2) + "M";
  return v.toLocaleString();
}
function fmtDate(s) { if (!s) return "—"; try { return new Date(s).toLocaleDateString(); } catch { return s; } }
function relTime(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)        return `${Math.round(d)}s ago`;
  if (d < 3600)      return `${Math.round(d / 60)}m ago`;
  if (d < 86400)     return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

function OutlookBadge({ outlook, action }) {
  const cls = outlook === "BULLISH" ? "outlook-bull"
            : outlook === "BEARISH" ? "outlook-bear"
            : "outlook-neutral";
  return (
    <div className={`outlook-badge ${cls}`}>
      <div className="outlook-label">{outlook}</div>
      <div className="outlook-action">{action}</div>
    </div>
  );
}

function PositionBadge({ action, confidence }) {
  const cls = {
    ADD:   "pos-add",
    HOLD:  "pos-hold",
    TRIM:  "pos-trim",
    EXIT:  "pos-exit",
    AVOID: "pos-avoid",
  }[action] || "pos-hold";
  return (
    <div className={`pos-badge ${cls}`}>
      <div className="pos-label">{action}</div>
      <div className="pos-confidence">{Math.round((confidence || 0) * 100)}% confidence</div>
    </div>
  );
}

// Render simple ** ** bold markup from the rules-based summary
function renderBold(text) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function OutlookCard({ title, data }) {
  return (
    <div className="card outlook-card">
      <div className="profile-card-head">
        <h3>{title}</h3>
        <OutlookBadge outlook={data.outlook} action={data.action} />
      </div>
      <p className="muted">Horizon: {data.horizon} · Confidence: {Math.round((data.confidence ?? 0) * 100)}%</p>
      <ul className="drivers">
        {(data.drivers || []).map((d, i) => <li key={i}>{d}</li>)}
      </ul>
      {data.risks?.length ? (
        <div className="outlook-risks">
          <strong>Watch for:</strong>
          <ul>{data.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export default function Profile({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let mounted = true;
    setLoading(true); setError(null);
    getProfile(ticker)
      .then((d) => mounted && setData(d))
      .catch((e) => mounted && setError(e.response?.data?.error || e.message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Loading {ticker} profile…</p></div>;
  if (error)            return <div className="card"><p className="err">Profile error: {error}</p></div>;
  if (!data)            return <div className="card"><p className="muted">No data.</p></div>;

  const a = data.analyst || {};
  const e = data.earnings || {};
  const p = data.position_recommendation || {};
  const k = data.key_levels || {};
  const r = data.risk_factors || {};
  const f = data.future_outlook || {};
  const det = data.detailed || {};

  return (
    <div className="profile-page">
      {/* ── Header + key-stats strip ── */}
      <div className="card profile-header">
        <div className="profile-header-top">
          <div className="profile-title">
            <h2>{data.name} <span className="muted">({data.ticker})</span></h2>
            <div className="profile-subtitle">
              {data.sector ? data.sector + " · " : ""}
              {data.industry || ""}
              {data.website ? <> · <a href={data.website} target="_blank" rel="noreferrer">website</a></> : null}
            </div>
          </div>
          <div className="profile-price">
            <div className="price-now">{fmtPrice(data.price)}</div>
            <div className={`price-chg ${data.change_pct >= 0 ? "up" : "down"}`}>{fmtPct(data.change_pct)}</div>
          </div>
        </div>
        <div className="profile-statline">
          <div className="stat"><span className="k">Mkt Cap</span><span className="v">{fmtBn(data.market_cap)}</span></div>
          <div className="stat"><span className="k">P/E TTM</span><span className="v">{data.pe_ratio?.toFixed(1) ?? "—"}</span></div>
          <div className="stat"><span className="k">Fwd P/E</span><span className="v">{data.forward_pe?.toFixed(1) ?? "—"}</span></div>
          <div className="stat"><span className="k">Beta</span><span className="v">{data.beta?.toFixed(2) ?? "—"}</span></div>
          <div className="stat"><span className="k">Div Yield</span><span className="v">{data.dividend_yield ? data.dividend_yield + "%" : "—"}</span></div>
          <div className="stat"><span className="k">52w High</span><span className="v">{fmtPrice(data["52w_high"])}</span></div>
          <div className="stat"><span className="k">52w Low</span><span className="v">{fmtPrice(data["52w_low"])}</span></div>
        </div>
      </div>

      {/* ── Position Recommendation + Quick Read — side by side ── */}
      <div className="profile-grid-two profile-grid-top">
        <div className="card position-card">
          <div className="profile-card-head">
            <h3>Position Recommendation</h3>
            <PositionBadge action={p.action} confidence={p.confidence} />
          </div>
          <p className="position-rationale">{p.rationale}</p>
          {p.reasons?.length ? (
            <ul className="drivers">
              {p.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
            </ul>
          ) : null}
          <div className="muted small">Total composite score: {p.total_score}</div>
        </div>

        <div className="card profile-summary">
          <h3>Quick Read (≈200 words)</h3>
          <p>{data.summary}</p>
        </div>
      </div>

      {/* ── Detailed multi-section analysis ── */}
      <div className="card profile-detailed">
        <h3>Detailed Analysis</h3>

        <div className="detailed-section">
          <h4>📈 Technical Outlook</h4>
          <p>{renderBold(det.technical_outlook)}</p>
        </div>

        <div className="detailed-section">
          <h4>💼 Fundamental Health</h4>
          <p>{renderBold(det.fundamental_health)}</p>
        </div>

        <div className="detailed-section">
          <h4>📊 Wall Street Sentiment</h4>
          <p>{renderBold(det.sentiment)}</p>
        </div>

        <div className="detailed-section">
          <h4>🎯 Position Recommendation</h4>
          <p>{renderBold(det.position_recommendation)}</p>
        </div>

        <div className="detailed-section">
          <h4>📐 Key Levels</h4>
          <p>{renderBold(det.key_levels_narrative)}</p>
        </div>

        <div className="detailed-section">
          <h4>⚠️ Risk Assessment</h4>
          <p>{renderBold(det.risk_assessment)}</p>
        </div>

        <div className="detailed-section">
          <h4>🔮 Future Outlook</h4>
          <p>{renderBold(det.future_outlook)}</p>
        </div>
      </div>

      {/* ── Three timeframe outlook cards ── */}
      <div className="profile-grid-three">
        <OutlookCard title="Short-term"   data={data.short_term} />
        <OutlookCard title="Medium-term"  data={data.medium_term} />
        <OutlookCard title="Long-term"    data={data.long_term} />
      </div>

      {/* ── Key Levels + Risk + Future Outlook — one compact row ── */}
      <div className="profile-grid-three">
      <div className="card">
        <h3>Key Levels</h3>
        <div className="levels-grid">
          <div className="levels-block resistance">
            <h4>Resistance</h4>
            <div className="level-row"><span>Secondary</span> <b>{fmtPrice(k.secondary_resistance)}</b></div>
            <div className="level-row"><span>Immediate</span> <b>{fmtPrice(k.immediate_resistance)}</b></div>
          </div>
          <div className="levels-block current">
            <h4>Current</h4>
            <div className="level-row current-row"><span>Price</span> <b>{fmtPrice(data.price)}</b></div>
            <div className="level-row"><span>ATR(14)</span> <b>{k.atr_14}</b></div>
          </div>
          <div className="levels-block support">
            <h4>Support</h4>
            <div className="level-row"><span>Immediate</span> <b>{fmtPrice(k.immediate_support)}</b></div>
            <div className="level-row"><span>Secondary</span> <b>{fmtPrice(k.secondary_support)}</b></div>
          </div>
        </div>
        <div className="trade-plan">
          <div className="plan-stat"><b>Stop loss (long):</b> {fmtPrice(k.suggested_stop_long)}</div>
          <div className="plan-stat"><b>Profit target (long):</b> {fmtPrice(k.suggested_target_long)}</div>
          <div className="plan-stat"><b>Risk:reward:</b> {k.suggested_target_long && k.suggested_stop_long ? ((k.suggested_target_long - data.price) / (data.price - k.suggested_stop_long)).toFixed(1) + ":1" : "—"}</div>
        </div>
      </div>

      {/* ── Risk Factors ── */}
      <div className="card">
        <h3>Risk Factors</h3>
        <div className="profile-mini-stats">
          <span><b>HV (30d ann):</b> {r.historical_volatility_pct}%</span>
          <span><b>Beta:</b> {r.beta ?? "—"}</span>
          <span><b>Max DD (1y):</b> <span className="down">{r.max_drawdown_1y_pct}%</span></span>
          <span><b>From 52w high:</b> <span className={r.distance_from_52w_high_pct >= 0 ? "up" : "down"}>{fmtPct(r.distance_from_52w_high_pct)}</span></span>
        </div>
        <ul className="risk-flags">
          {r.flags?.map((flag, i) => <li key={i}>{flag}</li>)}
        </ul>
      </div>

      {/* ── Future Outlook (numerical) ── */}
      <div className="card">
        <h3>Company Future Outlook</h3>
        <div className="profile-mini-stats">
          <span><b>Next-yr EPS est:</b> {f.next_year_eps != null ? `$${f.next_year_eps.toFixed(2)}` : "—"}</span>
          <span><b>Next-yr growth:</b> <span className={f.next_year_growth_pct >= 0 ? "up" : "down"}>{fmtPct(f.next_year_growth_pct)}</span></span>
          <span><b>5-yr growth:</b> <span className={f.five_year_growth_pct >= 0 ? "up" : "down"}>{fmtPct(f.five_year_growth_pct)}</span></span>
          <span><b>Revenue YoY:</b> <span className={f.revenue_growth_yoy >= 0 ? "up" : "down"}>{fmtPct(f.revenue_growth_yoy)}</span></span>
          <span><b>Mean target:</b> {fmtPrice(f.analyst_target_mean)}</span>
          <span><b>Upside:</b> <span className={f.analyst_upside_pct >= 0 ? "up" : "down"}>{fmtPct(f.analyst_upside_pct)}</span></span>
        </div>
      </div>
      </div>{/* end profile-grid-three */}

      {/* ── Gamma Exposure (options positioning) ── */}
      <GammaExposure ticker={data.ticker} />

      {/* ── Earnings + Analyst ── */}
      <div className="profile-grid-two">
        <div className="card">
          <h3>Earnings</h3>
          <div className="profile-mini-stats">
            <span><b>Next:</b> {fmtDate(e.next_date)}</span>
            <span><b>Last actual:</b> {e.last_eps_actual != null ? `$${e.last_eps_actual.toFixed(2)}` : "—"}</span>
            <span><b>Estimate:</b> {e.last_eps_estimate != null ? `$${e.last_eps_estimate.toFixed(2)}` : "—"}</span>
            <span><b>Surprise:</b> <span className={e.surprise_pct >= 0 ? "up" : "down"}>{fmtPct(e.surprise_pct)}</span></span>
            <span><b>EPS YoY:</b> {fmtPct(e.earnings_growth_yoy)}</span>
            <span><b>Rev YoY:</b> {fmtPct(e.revenue_growth_yoy)}</span>
          </div>
          {e.history?.length ? (
            <table className="profile-mini-table">
              <thead><tr><th>Quarter</th><th>EPS Est</th><th>EPS Act</th><th>Surprise</th></tr></thead>
              <tbody>
                {e.history.slice(-4).reverse().map((q, i) => {
                  const surp = q.actual != null && q.estimate ? ((q.actual - q.estimate) / Math.abs(q.estimate)) * 100 : null;
                  return (
                    <tr key={i}>
                      <td>{q.quarter}</td>
                      <td>${q.estimate?.toFixed(2) ?? "—"}</td>
                      <td>${q.actual?.toFixed(2) ?? "—"}</td>
                      <td className={surp >= 0 ? "up" : "down"}>{surp != null ? fmtPct(surp) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="muted">No earnings history available.</p>}
        </div>

        <div className="card">
          <h3>Analyst Consensus</h3>
          <div className="analyst-rating">
            <div className={`rating-pill rating-${a.recommendation?.toLowerCase().replace(" ", "-")}`}>
              {a.recommendation || "—"}
            </div>
            <div className="analyst-count">{a.analyst_count || 0} analysts</div>
          </div>
          <div className="profile-mini-stats">
            <span><b>Mean target:</b> {fmtPrice(a.target_mean)}</span>
            <span><b>High:</b> {fmtPrice(a.target_high)}</span>
            <span><b>Low:</b> {fmtPrice(a.target_low)}</span>
            <span><b>Upside:</b> <span className={a.upside_pct >= 0 ? "up" : "down"}>{fmtPct(a.upside_pct)}</span></span>
          </div>
          {a.counts ? (
            <div className="analyst-bars">
              {[
                ["Strong Buy",  a.counts.strongBuy,  "rating-strong-buy"],
                ["Buy",         a.counts.buy,        "rating-buy"],
                ["Hold",        a.counts.hold,       "rating-hold"],
                ["Sell",        a.counts.sell,       "rating-sell"],
                ["Strong Sell", a.counts.strongSell, "rating-strong-sell"],
              ].map(([label, count, cls]) => {
                const total = a.analyst_count || 1;
                return (
                  <div key={label} className="analyst-row">
                    <span className="analyst-label">{label}</span>
                    <div className="analyst-bar-bg">
                      <div className={`analyst-bar ${cls}`} style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                    <span className="analyst-num">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {a.recent_ratings?.length ? (
            <div className="recent-ratings">
              <h4>Recent Rating Changes</h4>
              <ul>
                {a.recent_ratings.slice(0, 5).map((r2, i) => (
                  <li key={i}>
                    <span className={`rating-action rating-action-${r2.action}`}>
                      {r2.action === "up" ? "↑" : r2.action === "down" ? "↓" : r2.action === "init" ? "•" : "="}
                    </span>
                    <b>{r2.firm}</b>
                    {r2.from && r2.to ? <span className="muted"> {r2.from} → {r2.to}</span> : r2.to ? <span className="muted"> {r2.to}</span> : null}
                    <span className="muted small"> · {r2.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── News + About — side by side ── */}
      <div className="profile-grid-two">
        <div className="card">
          <h3>Latest Headlines</h3>
          {!data.news?.length ? (
            <p className="muted">No recent news found.</p>
          ) : (
            <ul className="news-list">
              {data.news.map((n, i) => (
                <li key={i}>
                  <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                  <div className="news-meta">{n.publisher} · {relTime(n.published)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>About {data.name}</h3>
          <p className="muted about-clamp">
            {data.description || "No company description available."}
          </p>
        </div>
      </div>
    </div>
  );
}
