import { useEffect, useRef, useState } from "react";
import { getOptionDecay } from "../api.js";

const CURVE_COLORS = ["#58a6ff", "#26d96e", "#ffc200", "#ff7a8c"];

// ── Heat color scale: premium fraction 0..1 → color ──
// dark navy → deep blue → teal → gold → orange-red
const HEAT_STOPS = [
  [0.00, [13, 18, 28]],
  [0.22, [27, 73, 101]],
  [0.45, [42, 157, 143]],
  [0.70, [233, 196, 106]],
  [1.00, [231, 111, 81]],
];
function heatColor(frac) {
  const f = Math.max(0, Math.min(1, frac));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [p0, c0] = HEAT_STOPS[i - 1];
    const [p1, c1] = HEAT_STOPS[i];
    if (f <= p1) {
      const t = (f - p0) / (p1 - p0 || 1);
      const r = Math.round(c0[0] + t * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + t * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + t * (c1[2] - c0[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(231,111,81)";
}

// Heatmap size presets (max rendered width in px)
const SURFACE_SIZES = { S: 480, M: 680, L: 880, XL: 1120 };

// ── Multi-dimensional heatmap: price (Y) × time-of-day (X) → premium (color) ──
function SurfaceHeatmap({ surface }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);   // live, follows the mouse
  const [pinned, setPinned] = useState(null); // set by clicking a cell
  const [size, setSize] = useState(() => localStorage.getItem("bandaru_decay_size") || "M");
  if (!surface?.grid?.length) return null;

  const maxW = SURFACE_SIZES[size] || 680;
  const pickSize = (s) => { setSize(s); localStorage.setItem("bandaru_decay_size", s); };

  const { time_axis, price_axis, grid, now_col, spot_row } = surface;
  const rows = price_axis.length;
  const cols = time_axis.length;
  const maxPrem = Math.max(...grid.flat(), 0.01);

  const W = 680, H = 322;
  const padL = 52, padR = 64, padT = 24, padB = 40;
  const cellW = (W - padL - padR) / cols;
  const cellH = (H - padT - padB) / rows;

  // Update the floating tooltip with the cell + the cursor's pixel position
  // relative to the wrapper, so the field tracks the mouse.
  const trackMouse = (e, cell) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ ...cell, mx: e.clientX - rect.left, my: e.clientY - rect.top });
  };

  const active = hover || pinned;
  // Flip the tooltip to the left of the cursor when near the right edge
  const wrapW = wrapRef.current?.getBoundingClientRect().width || 760;
  const flipLeft = active && active.mx > wrapW - 150;

  return (
    <div className="surface-wrap" ref={wrapRef}
         onMouseLeave={() => setHover(null)}>
      <div className="surface-size-bar">
        <span>Heatmap size</span>
        {Object.keys(SURFACE_SIZES).map((s) => (
          <button key={s} className={size === s ? "active" : ""} onClick={() => pickSize(s)}>{s}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="surface-svg" preserveAspectRatio="xMidYMid meet"
           style={{ maxWidth: maxW + "px" }}>
        <text x={padL} y={16} className="surface-axis-label">
          Option premium surface — price (vertical) × time of day (horizontal)
        </text>

        {/* cells */}
        {grid.map((rowVals, ri) =>
          rowVals.map((v, ci) => {
            const x = padL + ci * cellW;
            const y = padT + ri * cellH;
            const cell = { ri, ci, v, price: price_axis[ri], time: time_axis[ci], x, y };
            return (
              <rect key={`${ri}-${ci}`}
                x={x} y={y} width={cellW + 0.5} height={cellH + 0.5}
                fill={heatColor(v / maxPrem)}
                style={{ cursor: "crosshair" }}
                onMouseMove={(e) => trackMouse(e, cell)}
                onClick={(e) => {
                  const rect = wrapRef.current?.getBoundingClientRect();
                  setPinned({ ...cell, mx: e.clientX - (rect?.left || 0), my: e.clientY - (rect?.top || 0) });
                }} />
            );
          })
        )}

        {/* now column + spot row highlights */}
        {now_col != null && (
          <rect x={padL + now_col * cellW} y={padT} width={cellW} height={rows * cellH}
            fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" pointerEvents="none" />
        )}
        {spot_row != null && (
          <rect x={padL} y={padT + spot_row * cellH} width={cols * cellW} height={cellH}
            fill="none" stroke="#58a6ff" strokeWidth="1.5" opacity="0.85" pointerEvents="none" />
        )}

        {/* active cell outline */}
        {active && (
          <rect x={padL + active.ci * cellW} y={padT + active.ri * cellH}
            width={cellW} height={cellH} fill="none" stroke="#fff" strokeWidth="2" pointerEvents="none" />
        )}

        {/* y axis — price labels */}
        {price_axis.map((p, ri) => (ri % 3 === 0 || ri === spot_row) ? (
          <text key={`yl${ri}`} x={padL - 6} y={padT + ri * cellH + cellH / 2 + 3}
            textAnchor="end"
            className={ri === spot_row ? "surface-tick spot" : "surface-tick"}>
            ${p.toFixed(0)}
          </text>
        ) : null)}

        {/* x axis — time labels */}
        {time_axis.map((t, ci) => (ci % 2 === 0 || ci === now_col || ci === cols - 1) ? (
          <text key={`xl${ci}`} x={padL + ci * cellW + cellW / 2} y={H - padB + 16}
            textAnchor="middle"
            className={ci === now_col ? "surface-tick now" : "surface-tick"}>
            {t}
          </text>
        ) : null)}
        <text x={padL + (cols * cellW) / 2} y={H - 8} textAnchor="middle" className="surface-axis-label">
          Time of Day  (8:30 AM → 4:00 PM · expiration 4:00 PM)
        </text>
        <text x={14} y={padT + (rows * cellH) / 2} textAnchor="middle" className="surface-axis-label"
          transform={`rotate(-90 14 ${padT + (rows * cellH) / 2})`}>Stock Price</text>

        {/* color legend */}
        {Array.from({ length: 40 }).map((_, i) => {
          const frac = 1 - i / 39;
          return (
            <rect key={`lg${i}`} x={W - padR + 18} y={padT + i * ((rows * cellH) / 40)}
              width={14} height={(rows * cellH) / 40 + 0.5} fill={heatColor(frac)} pointerEvents="none" />
          );
        })}
        <text x={W - padR + 36} y={padT + 8} className="surface-tick">${maxPrem.toFixed(2)}</text>
        <text x={W - padR + 36} y={padT + rows * cellH} className="surface-tick">$0</text>
        <text x={W - padR + 25} y={padT - 8} textAnchor="middle" className="surface-tick">Premium</text>
      </svg>

      {/* Floating tooltip — follows the mouse, shows the live premium */}
      {active && (
        <div className="surface-tooltip"
             style={{
               left: flipLeft ? active.mx - 142 : active.mx + 16,
               top:  active.my + 14,
             }}>
          <div className="tt-premium">${active.v.toFixed(2)}</div>
          <div className="tt-detail">stock&nbsp;<b>${active.price.toFixed(2)}</b></div>
          <div className="tt-detail">time&nbsp;<b>{active.time}</b></div>
          {pinned && active === pinned ? <div className="tt-pinned">📌 pinned — click again to move</div> : null}
        </div>
      )}

      <div className="surface-hover muted">
        Move the mouse over the heatmap — the premium follows your cursor. Click a cell to pin it.
        White dashes = now, blue row = current spot.
      </div>
    </div>
  );
}

// ── Line chart: premium vs stock price, one curve per time snapshot ──
function DecayGraph({ data }) {
  if (!data?.curves?.length) return null;
  const W = 720, H = 300, padL = 52, padR = 16, padT = 14, padB = 36;
  const prices = data.price_range;
  const allPremiums = data.curves.flatMap((c) => c.premiums);
  const xMin = prices[0], xMax = prices[prices.length - 1];
  const yMax = Math.max(...allPremiums) * 1.1 || 1;
  const x = (p) => padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR);
  const y = (v) => H - padB - (v / yMax) * (H - padT - padB);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="decay-svg" preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <g key={i}>
          <line x1={padL} y1={y(yMax * f)} x2={W - padR} y2={y(yMax * f)} stroke="#1e2126" />
          <text x={padL - 6} y={y(yMax * f) + 3} textAnchor="end" className="decay-axis-text">${(yMax * f).toFixed(2)}</text>
        </g>
      ))}
      <line x1={x(data.strike)} y1={padT} x2={x(data.strike)} y2={H - padB} stroke="#ffc200" strokeDasharray="4 3" opacity="0.7" />
      <line x1={x(data.spot)} y1={padT} x2={x(data.spot)} y2={H - padB} stroke="#c5cdd6" strokeDasharray="2 2" opacity="0.6" />
      {data.curves.map((c, ci) => (
        <polyline key={ci}
          points={c.premiums.map((v, i) => `${x(prices[i])},${y(v)}`).join(" ")}
          fill="none" stroke={CURVE_COLORS[ci % CURVE_COLORS.length]}
          strokeWidth={ci === 0 ? 2.5 : 1.8}
          strokeDasharray={ci === data.curves.length - 1 ? "5 3" : "none"} />
      ))}
      <text x={W / 2} y={H - 4} textAnchor="middle" className="decay-axis-label">Stock Price</text>
    </svg>
  );
}

export default function OptionDecay({ ticker }) {
  const [type, setType] = useState("call");
  const [dte, setDte] = useState(0);
  const [strike, setStrike] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = (overrideStrike) => {
    setLoading(true); setError(null);
    const params = { ticker, type, dte };
    const s = overrideStrike !== undefined ? overrideStrike : strike;
    if (s !== "" && s != null) params.strike = s;
    getOptionDecay(params)
      .then((d) => { setData(d); if (strike === "") setStrike(String(d.strike)); })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setStrike(""); load(""); /* eslint-disable-next-line */ }, [ticker, type, dte]);

  const g = data?.greeks || {};

  return (
    <div className="decay-page">
      <div className="card">
        <h2>Option Decay Lab — {ticker}</h2>
        <p className="muted">
          Black-Scholes model of how the premium moves with stock price and time of day.
        </p>
        <div className="decay-controls">
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>
          <label>Strike
            <input type="number" step="1" value={strike}
              onChange={(e) => setStrike(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="ATM" />
          </label>
          <label>Days to expiry
            <select value={dte} onChange={(e) => setDte(parseInt(e.target.value, 10))}>
              <option value={0}>0DTE (today)</option>
              <option value={1}>1 day</option>
              <option value={2}>2 days</option>
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
            </select>
          </label>
          <button className="primary" onClick={() => load()} disabled={loading}>
            {loading ? "Computing…" : "Update"}
          </button>
        </div>
        {error ? <p className="err">Error: {error}</p> : null}
      </div>

      {data ? (
        <>
          {/* Greeks strip */}
          <div className="card decay-summary">
            <div className="decay-stat big">
              <span className="decay-stat-label">Current Premium</span>
              <span className="decay-stat-value">${data.current_premium}</span>
            </div>
            <div className="decay-stat"><span className="decay-stat-label">Δ Delta</span><span>{g.delta}</span></div>
            <div className="decay-stat"><span className="decay-stat-label">Γ Gamma</span><span>{g.gamma}</span></div>
            <div className="decay-stat theta-stat"><span className="decay-stat-label">Θ Theta /day</span><span>{g.theta}</span></div>
            <div className="decay-stat"><span className="decay-stat-label">ν Vega</span><span>{g.vega}</span></div>
            <div className="decay-stat"><span className="decay-stat-label">Intrinsic</span><span>${g.intrinsic}</span></div>
            <div className="decay-stat"><span className="decay-stat-label">Extrinsic</span><span>${g.extrinsic}</span></div>
            <div className="decay-stat"><span className="decay-stat-label">IV</span><span>{data.iv}%</span></div>
            <div className="decay-stat"><span className="decay-stat-label">Spot / Strike</span><span>${data.spot} / ${data.strike}</span></div>
          </div>

          {/* THE multi-dimensional graph */}
          <div className="card">
            <h3>Premium Surface — Stock Price × Time of Day</h3>
            <p className="muted small">
              Every cell is the option's theoretical premium at that stock price (row) and
              clock time (column). Warm colors = richer premium, dark = cheap. Moving right
              across a row shows pure time decay; moving up/down a column shows price sensitivity.
            </p>
            <SurfaceHeatmap surface={data.surface} />
          </div>

          {/* Supporting line view */}
          <div className="card">
            <h3>Premium vs Stock Price — by time remaining</h3>
            <div className="decay-legend">
              {data.curves.map((c, i) => (
                <span key={i} className="decay-legend-item">
                  <span className="decay-swatch" style={{ background: CURVE_COLORS[i % CURVE_COLORS.length] }} />
                  {c.label} ({c.hours_left}h)
                </span>
              ))}
            </div>
            <DecayGraph data={data} />
          </div>
        </>
      ) : !error ? (
        <div className="card"><p className="muted">Computing decay model…</p></div>
      ) : null}
    </div>
  );
}
