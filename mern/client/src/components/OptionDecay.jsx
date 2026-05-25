import { useEffect, useMemo, useRef, useState } from "react";
import { getOptionDecay } from "../api.js";

const CURVE_COLORS = ["#58a6ff", "#26d96e", "#ffc200", "#ff7a8c"];

// ─────────────────────────── formatting ───────────────────────────
const fmtUSD = (v) => {
  const sign = v < 0 ? "-" : "+";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};
const fmtAxis = (v) =>
  `${v < 0 ? "-$" : "$"}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const fmtPlain = (v) =>
  `$${Math.round(v).toLocaleString("en-US")}`;

// Standard normal CDF — Abramowitz & Stegun 7.1.26 (matches the server engine)
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
              + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function normPdf(x) {
  return 0.3989422804014327 * Math.exp(-(x * x) / 2);
}

// Black-Scholes price + greeks — mirrors the server engine, so the greeks
// strip can update live at the simulated underlying price (the slider).
function bsGreeks(S, K, T, r, sigma, type) {
  const isCall = type !== "put";
  const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (T <= 0 || sigma <= 0) {
    return {
      price: intrinsic,
      delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0, theta: 0, vega: 0, intrinsic, extrinsic: 0,
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  let price, delta;
  if (isCall) {
    price = S * normCdf(d1) - K * disc * normCdf(d2);
    delta = normCdf(d1);
  } else {
    price = K * disc * normCdf(-d2) - S * normCdf(-d1);
    delta = normCdf(d1) - 1;
  }
  const gamma = normPdf(d1) / (S * sigma * sqrtT);
  const vega = (S * normPdf(d1) * sqrtT) / 100;
  const term1 = -(S * normPdf(d1) * sigma) / (2 * sqrtT);
  const thetaAnnual = isCall
    ? term1 - r * K * disc * normCdf(d2)
    : term1 + r * K * disc * normCdf(-d2);
  const finalPrice = Math.max(price, 0);
  return {
    price: finalPrice, delta, gamma, theta: thetaAnnual / 365, vega,
    intrinsic, extrinsic: Math.max(finalPrice - intrinsic, 0),
  };
}

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

// ───── Linear-interpolate the simulator grid at an arbitrary price ─────
// Returns an array of modeled premium (per share) — one entry per time point.
function premiumRowAt(sim, price) {
  const ax = sim.price_axis;
  const n = ax.length;
  if (price <= ax[0]) return sim.grid[0];
  if (price >= ax[n - 1]) return sim.grid[n - 1];
  let i = 0;
  while (i < n - 1 && ax[i + 1] < price) i++;
  const lo = sim.grid[i], hi = sim.grid[i + 1];
  const frac = (price - ax[i]) / (ax[i + 1] - ax[i] || 1);
  return lo.map((v, t) => v + frac * (hi[t] - v));
}

// ═════════════════ Simulated-returns decay chart ═════════════════
// Plots position P&L over time (Now → Expiration) at the chosen
// underlying price — pure time decay of the modeled premium.
function SimChart({ points, returns }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  if (!points?.length || !returns?.length) return null;

  const n = points.length;
  const W = 720, H = 280, padL = 66, padR = 22, padT = 26, padB = 30;

  let yMin = Math.min(...returns);
  let yMax = Math.max(...returns);
  if (yMax - yMin < 1) { yMax += 1; yMin -= 1; }
  const span = yMax - yMin;
  yMax += span * 0.14;
  yMin -= span * 0.14;

  const x = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB);

  const pos = returns[0] >= 0;
  const line = pos ? "#26d96e" : "#ff7a8c";

  const pathPts = returns.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = `${x(0)},${y(yMin)} ${pathPts} ${x(n - 1)},${y(yMin)}`;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));

  const onMove = (e) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const step = (W - padL - padR) / (n - 1 || 1);
    let idx = Math.round((px - padL) / step);
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div className="sim-chart-wrap" ref={wrapRef}
         onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="simfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={line} stopOpacity="0.30" />
            <stop offset="100%" stopColor={line} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + $ axis */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#1e2126" />
            <text x={padL - 8} y={y(v) + 3} textAnchor="end" className="sim-axis-text">
              {fmtAxis(v)}
            </text>
          </g>
        ))}

        {/* break-even line */}
        {yMin < 0 && yMax > 0 && (
          <>
            <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)}
                  stroke="#6a727c" strokeDasharray="4 3" />
            <text x={W - padR} y={y(0) - 5} textAnchor="end" className="sim-axis-text">
              break-even
            </text>
          </>
        )}

        {/* area + decay curve */}
        <polygon points={areaPts} fill="url(#simfill)" stroke="none" />
        <polyline points={pathPts} fill="none" stroke={line} strokeWidth="2.6"
                  strokeLinejoin="round" strokeLinecap="round" />

        {/* "Now" marker */}
        <line x1={x(0)} y1={padT - 4} x2={x(0)} y2={H - padB} stroke="#3a424c" />
        <text x={x(0)} y={padT - 9} textAnchor="start" className="sim-now-text">Now</text>

        {/* point dots */}
        {returns.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === 0 ? 4.6 : 2.6}
                  fill={i === 0 ? line : "#0d1117"} stroke={line} strokeWidth="1.6" />
        ))}

        {/* x-axis time labels */}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className={`sim-x-text ${p.kind === "exp" ? "exp" : ""}`}>
            {p.label}
          </text>
        ))}

        {/* hover guide */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB}
                  stroke="#586069" strokeDasharray="3 2" />
            <circle cx={x(hover)} cy={y(returns[hover])} r="5" fill={line} />
          </g>
        )}
      </svg>

      {hover != null && (
        <div className="sim-tip" style={{
          left: `${Math.max(9, Math.min(91, (x(hover) / W) * 100))}%`,
          top: `${(y(returns[hover]) / H) * 100}%`,
        }}>
          <b className={returns[hover] >= 0 ? "pos" : "neg"}>{fmtUSD(returns[hover])}</b>
          <span>
            {points[hover].label}
            {points[hover].kind === "mid" ? ` · ${points[hover].hours_left}h left` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ───────────── Underlying-price slider with value bubble ─────────────
function PriceSlider({ min, max, value, onChange }) {
  const valPct = max > min ? ((value - min) / (max - min)) * 100 : 50;
  const bubbleLeft = Math.max(5, Math.min(95, valPct));
  return (
    <div className="sim-slider-wrap">
      <div className="sim-bubble" style={{ left: `${bubbleLeft}%` }}>
        ${value.toFixed(2)}
      </div>
      <input className="sim-slider" type="range"
             min={min} max={max} step="0.01" value={value}
             style={{ "--pct": `${valPct}%` }}
             onChange={(e) => onChange(parseFloat(e.target.value))} />
      <div className="sim-scale">
        <span>${min.toFixed(2)}</span>
        <span className="sim-scale-mid">drag to simulate the underlying price</span>
        <span>${max.toFixed(2)}</span>
      </div>
    </div>
  );
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

  const trackMouse = (e, cell) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ ...cell, mx: e.clientX - rect.left, my: e.clientY - rect.top });
  };

  const active = hover || pinned;
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

// ════════════════════════════ main ════════════════════════════
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function OptionDecay({ ticker }) {
  const [type, setType] = useState("call");
  const [expiry, setExpiry] = useState(todayStr);   // expiration DATE (YYYY-MM-DD)
  const [strike, setStrike] = useState("");          // "" = ATM
  const [contracts, setContracts] = useState("1");
  const [entry, setEntry] = useState("");            // optional cost basis
  const [mode, setMode] = useState("$");             // "$" | "%"
  const [view, setView] = useState("sim");           // "sim" | "heatmap"
  const [simPrice, setSimPrice] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Days-to-expiry derived from the chosen expiry date.
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const dteDays = Math.max(
    0, Math.round((new Date(expiry + "T00:00:00") - t0) / 86400000),
  );

  // Fetch the model. Pure read — never overwrites the cost-basis field.
  const load = () => {
    setLoading(true); setError(null);
    const params = { ticker, type, dte: dteDays };
    if (strike !== "" && strike != null) params.strike = strike;
    getOptionDecay(params)
      .then((d) => { setData(d); setSimPrice(d.spot); })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  // Auto-recompute (debounced) whenever any contract input changes — so the
  // premium, greeks and decay all populate live from ticker / type / strike /
  // expiry without a manual "Update" click.
  useEffect(() => {
    const id = setTimeout(load, 350);
    return () => clearTimeout(id);
    /* eslint-disable-next-line */
  }, [ticker, type, strike, expiry]);

  const sim = data?.simulator;

  // Live entry / contracts as numbers
  const contractsN = Math.max(1, parseInt(contracts, 10) || 1);
  const liveEntry = data ? data.current_premium : 0;
  const entryNum = (() => {
    const v = parseFloat(entry);
    return isFinite(v) && v >= 0 ? v : liveEntry;
  })();

  // Everything the simulator panel needs — recomputed client-side as the
  // slider / contracts / entry change (no extra API calls).
  const calc = useMemo(() => {
    if (!sim || simPrice == null) return null;
    const prem = premiumRowAt(sim, simPrice);
    const basis = entryNum * 100 * contractsN;
    const returns = prem.map((p) => (p - entryNum) * 100 * contractsN);
    const values = prem.map((p) => p * 100 * contractsN);
    return {
      prem, returns, values, basis,
      nowPremium: prem[0],
      nowReturn: returns[0],
      nowValue: values[0],
    };
  }, [sim, simPrice, contractsN, entryNum]);

  // Probability of profit — lognormal model of where the underlying lands by
  // expiration (current spot, IV, time left). Independent of the slider.
  const prob = useMemo(() => {
    if (!data) return null;
    const r = 0.05;
    const isCall = data.type !== "put";
    const S = data.spot;
    const sigma = (data.iv || 0) / 100;
    const T = (data.total_hours_left || 0) / (365 * 24);
    const breakeven = isCall ? data.strike + entryNum : data.strike - entryNum;
    const reach = (target) => {
      if (target <= 0) return isCall ? 1 : 0;
      if (T <= 0 || sigma <= 0) return (isCall ? S > target : S < target) ? 1 : 0;
      const d2 = (Math.log(S / target) + (r - (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
      return isCall ? normCdf(d2) : normCdf(-d2);
    };
    return { pop: reach(breakeven), itm: reach(data.strike), breakeven };
  }, [data, entryNum]);

  // Greeks recomputed live at the simulated underlying price (the slider) — so
  // premium, intrinsic, extrinsic, delta… all track the price you scrub to.
  const liveGreeks = useMemo(() => {
    if (!data || simPrice == null) return null;
    const T = (data.total_hours_left || 0) / (365 * 24);
    const sigma = (data.iv || 0) / 100;
    return bsGreeks(simPrice, data.strike, T, 0.05, sigma, data.type);
  }, [data, simPrice]);
  const gv = liveGreeks || data?.greeks || {};

  const bigText = !calc ? "—"
    : mode === "%"
      ? (calc.basis > 0.5
          ? `${calc.nowReturn >= 0 ? "+" : "-"}${Math.abs((calc.nowReturn / calc.basis) * 100).toFixed(2)}%`
          : "—")
      : fmtUSD(calc.nowReturn);
  const bigPos = calc ? calc.nowReturn >= 0 : true;

  return (
    <div className="decay-page">
      {/* ── controls ── */}
      <div className="card">
        <div className="sim-toolbar">
          <div>
            <h2>Premium Simulator — {ticker}</h2>
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              Black-Scholes model of how an option's premium decays from now to expiration.
            </p>
          </div>
          <div className="sim-view-toggle">
            <button className={view === "sim" ? "active" : ""} onClick={() => setView("sim")}>
              Simulator
            </button>
            <button className={view === "heatmap" ? "active" : ""} onClick={() => setView("heatmap")}>
              Heatmap
            </button>
          </div>
        </div>

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
              placeholder={data ? `ATM (${data.strike})` : "ATM"} />
          </label>
          <label>Expiry date
            <input type="date" value={expiry} min={todayStr()}
              onChange={(e) => setExpiry(e.target.value)} />
          </label>
          <label>Contracts
            <input type="number" min="1" step="1" value={contracts}
              onChange={(e) => setContracts(e.target.value)} />
          </label>
          <label>Your cost / contract
            <input type="number" min="0" step="0.01" value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={liveEntry ? `modeled ${liveEntry}` : "modeled"} />
          </label>
          <span className="decay-auto muted small">
            {loading ? "computing…" : `${dteDays} DTE · auto-updates`}
          </span>
        </div>
        {error ? <p className="err">Error: {error}</p> : null}
      </div>

      {!data ? (
        !error ? <div className="card"><p className="muted">Computing decay model…</p></div> : null
      ) : view === "sim" && calc && sim ? (
        <>
          {/* ── the Simulated-Returns panel ── */}
          <div className="card sim-card">
            <div className="sim-head">
              <div className="sim-contract">
                {ticker} <b>${data.strike}</b> {data.type === "put" ? "Put" : "Call"}
                <span className="sim-mult">{contractsN}×</span>
              </div>
              <span className="sim-badge">Modeled · Black-Scholes</span>
            </div>

            <div className="sim-returns-label">
              Simulated Returns
              <span className="sim-info" title="Modeled profit/loss if the underlying sits at the slider price, shown decaying from now to expiration. Cost basis = your Entry $ (defaults to the current modeled premium).">ⓘ</span>
            </div>

            <div className="sim-pnl-row">
              <span className={`sim-pnl ${bigPos ? "pos" : "neg"}`}>{bigText}</span>
              <button className="sim-swap" onClick={() => setMode(mode === "$" ? "%" : "$")}
                      title="Toggle $ / %">⇄</button>
            </div>

            <div className="sim-sub">
              <b>${calc.nowPremium.toFixed(2)}</b> estimated contract price
              <span className="sim-dot">·</span>
              {fmtPlain(calc.nowValue)} position value
              <span className="sim-dot">·</span>
              at <b>${simPrice.toFixed(2)}</b> underlying, now
            </div>

            <SimChart points={sim.time_points} returns={calc.returns} />

            <PriceSlider
              min={sim.price_axis[0]}
              max={sim.price_axis[sim.price_axis.length - 1]}
              value={simPrice}
              onChange={setSimPrice} />

            {prob && (
              <div className="sim-prob-row">
                <div className="sim-prob">
                  <div className="sim-prob-head">
                    <span>Probability of Profit</span>
                    <b className={prob.pop >= 0.5 ? "pos" : "neg"}>
                      {(prob.pop * 100).toFixed(0)}%
                    </b>
                  </div>
                  <div className="sim-prob-bar">
                    <span className={prob.pop >= 0.5 ? "good" : "warn"}
                          style={{ width: `${Math.round(prob.pop * 100)}%` }} />
                  </div>
                  <div className="sim-prob-note">
                    modeled chance the trade is profitable at expiration · break-even
                    ${prob.breakeven.toFixed(2)}
                  </div>
                </div>
                <div className="sim-prob">
                  <div className="sim-prob-head">
                    <span>Finishes In-The-Money</span>
                    <b>{(prob.itm * 100).toFixed(0)}%</b>
                  </div>
                  <div className="sim-prob-bar">
                    <span className="neutral"
                          style={{ width: `${Math.round(prob.itm * 100)}%` }} />
                  </div>
                  <div className="sim-prob-note">
                    chance the option expires past the ${data.strike} strike
                  </div>
                </div>
              </div>
            )}

            <div className="sim-foot">
              <span className="muted">
                Spot <b>${data.spot}</b> · Strike <b>${data.strike}</b> · IV <b>{data.iv}%</b>
                {" · "}{data.total_hours_left}h to expiration
              </span>
              <button className="sim-reset" onClick={() => setSimPrice(data.spot)}>
                Reset to spot
              </button>
            </div>
          </div>
        </>
      ) : view === "heatmap" ? (
        <>
          <div className="card">
            <h3>Premium Surface — Stock Price × Time of Day</h3>
            <p className="muted small">
              Every cell is the option's theoretical premium at that stock price (row) and
              clock time (column). Warm colors = richer premium, dark = cheap. Moving right
              across a row shows pure time decay; moving up/down a column shows price sensitivity.
            </p>
            <SurfaceHeatmap surface={data.surface} />
          </div>
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
      ) : null}

      {/* ── greeks strip — live at the simulated price (slider) ── */}
      {data ? (
        <div className="card decay-summary">
          <div className="decay-stat big">
            <span className="decay-stat-label">Premium @ ${Number(simPrice ?? data.spot).toFixed(2)}</span>
            <span className="decay-stat-value">${Number(gv.price ?? 0).toFixed(2)}</span>
          </div>
          <div className="decay-stat"><span className="decay-stat-label">Δ Delta</span><span>{Number(gv.delta ?? 0).toFixed(3)}</span></div>
          <div className="decay-stat"><span className="decay-stat-label">Γ Gamma</span><span>{Number(gv.gamma ?? 0).toFixed(3)}</span></div>
          <div className="decay-stat theta-stat"><span className="decay-stat-label">Θ Theta /day</span><span>{Number(gv.theta ?? 0).toFixed(3)}</span></div>
          <div className="decay-stat"><span className="decay-stat-label">ν Vega</span><span>{Number(gv.vega ?? 0).toFixed(3)}</span></div>
          <div className="decay-stat"><span className="decay-stat-label">Intrinsic</span><span>${Number(gv.intrinsic ?? 0).toFixed(2)}</span></div>
          <div className="decay-stat"><span className="decay-stat-label">Extrinsic</span><span>${Number(gv.extrinsic ?? 0).toFixed(2)}</span></div>
          <div className="decay-stat"><span className="decay-stat-label">IV</span><span>{data.iv}%</span></div>
          <div className="decay-stat"><span className="decay-stat-label">Spot / Strike</span><span>${data.spot} / ${data.strike}</span></div>
        </div>
      ) : null}
    </div>
  );
}
