import { useEffect, useState } from "react";
import { getGamma } from "../api.js";

function fmtGex(v) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

// Net-GEX-by-strike horizontal bar chart.
function GexChart({ profile, spot, zeroGamma }) {
  if (!profile?.length) return null;
  // Keep the chart readable — show the most significant strikes.
  const top = [...profile]
    .sort((a, b) => Math.abs(b.net_gex) - Math.abs(a.net_gex))
    .slice(0, 22)
    .sort((a, b) => b.strike - a.strike);
  const maxAbs = Math.max(...top.map((r) => Math.abs(r.net_gex)), 1);

  const W = 380, rowH = 17, padTop = 6, midX = 190, half = 150;
  const H = padTop * 2 + top.length * rowH;
  const barX = (v) => (v >= 0 ? midX : midX + (v / maxAbs) * half);
  const barW = (v) => Math.max(1, Math.abs((v / maxAbs) * half));

  return (
    <svg className="gex-chart" viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <line x1={midX} y1={padTop} x2={midX} y2={H - padTop} stroke="#3a4350" strokeWidth="1" />
      {top.map((r, i) => {
        const y = padTop + i * rowH;
        const nearSpot = spot && Math.abs(r.strike - spot) <= 0.5;
        return (
          <g key={r.strike}>
            <rect x={barX(r.net_gex)} y={y + 2} width={barW(r.net_gex)} height={rowH - 5}
                  fill={r.net_gex >= 0 ? "#26d96e" : "#ff7a8c"} opacity="0.85" rx="1.5" />
            <text x={6} y={y + rowH - 5}
                  fill={nearSpot ? "#ffd166" : "#97a1ab"}
                  fontSize="10" fontWeight={nearSpot ? "700" : "400"}>
              {r.strike}{nearSpot ? " ◀" : ""}
            </text>
            <text x={W - 4} y={y + rowH - 5} fill="#97a1ab" fontSize="9" textAnchor="end">
              {fmtGex(r.net_gex)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function GammaExposure({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let on = true;
    setLoading(true); setError(null);
    getGamma(ticker)
      .then((d) => on && setData(d))
      .catch((e) => on && setError(e.response?.data?.error || e.message))
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Loading gamma exposure…</p></div>;
  if (error)            return <div className="card"><p className="err">Gamma exposure error: {error}</p></div>;
  if (!data)            return null;

  if (!data.available) {
    return (
      <div className="card">
        <h3>Gamma Exposure (GEX)</h3>
        <p className="muted">{data.note || "No option chain available."}</p>
      </div>
    );
  }

  const pos = data.regime === "positive";

  return (
    <div className="card gex-panel">
      <div className="profile-card-head">
        <h3>Gamma Exposure (GEX)</h3>
        <span className={`gex-regime ${pos ? "gex-pos" : "gex-neg"}`}>
          {pos ? "POSITIVE γ" : "NEGATIVE γ"}
        </span>
      </div>

      <div className="gex-headline">
        <div className="gex-big">
          <span className="k">Total net GEX</span>
          <span className={`v ${data.total_gex >= 0 ? "up" : "down"}`}>{fmtGex(data.total_gex)}</span>
          <span className="sub">per 1% {data.ticker} move</span>
        </div>
        <p className="gex-regime-note">{data.regime_note}</p>
      </div>

      <div className="gex-stats">
        <div className="stat"><span className="k">Spot</span><span className="v">${data.spot?.toFixed(2)}</span></div>
        <div className="stat"><span className="k">Zero-γ (flip)</span><span className="v">{data.zero_gamma != null ? `$${data.zero_gamma.toFixed(2)}` : "—"}</span></div>
        <div className="stat"><span className="k">Call wall</span><span className="v up">{data.call_wall?.strike ?? "—"}</span></div>
        <div className="stat"><span className="k">Put wall</span><span className="v down">{data.put_wall?.strike ?? "—"}</span></div>
        <div className="stat"><span className="k">Strikes</span><span className="v">{data.strikes_used}</span></div>
        <div className="stat"><span className="k">γ source</span><span className="v">{data.gamma_source?.feed ? `${data.gamma_source.feed} feed` : `${data.gamma_source?.model || 0} model`}</span></div>
      </div>

      <h4 className="gex-sub">Net GEX by strike</h4>
      <GexChart profile={data.profile} spot={data.spot} zeroGamma={data.zero_gamma} />

      <p className="muted small">{data.note}</p>
    </div>
  );
}
