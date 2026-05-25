import { useEffect, useState } from "react";
import { getGexDashboard } from "../api.js";

const LV_COLOR = {
  cw: "#26d96e", em: "#f1c870", flip: "#f1c870", vwap: "#c77dff",
  gmid: "#e6edf3", pw: "#ff7a8c", emdn: "#ff7a8c", spot: "#58a6ff",
};
const fmtM = (v) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  return `${v < 0 ? "-" : "+"}${a.toFixed(2)}M`;
};

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`gxd-metric ${tone || ""}`}>
      <div className="gxd-metric-label">{label}</div>
      <div className="gxd-metric-value">{value}</div>
      {sub ? <div className="gxd-metric-sub">{sub}</div> : null}
    </div>
  );
}

function SideRow({ label, value, tone }) {
  return (
    <div className="gxd-side-row">
      <div className="gxd-side-label">{label}</div>
      <div className={`gxd-side-value ${tone || ""}`}>{value}</div>
    </div>
  );
}

function SignalBox({ title, children, tone }) {
  return (
    <div className={`gxd-sig ${tone || ""}`}>
      <div className="gxd-sig-title">{title}</div>
      <div className="gxd-sig-body">{children}</div>
    </div>
  );
}

// Vertical price-level map — the GEX walls, flip, VWAP, expected move + spot.
function LevelLadder({ data }) {
  const levels = [];
  (data.call_walls || []).forEach((w) => levels.push({ label: w.label, price: w.strike, cls: "cw" }));
  if (data.expected_move?.upper) levels.push({ label: "UPPER EXPECTED MOVE", price: data.expected_move.upper, cls: "em", dash: true });
  if (data.flip_level != null) levels.push({ label: "GEX FLIP LEVEL", price: data.flip_level, cls: "flip" });
  if (data.vwap != null) levels.push({ label: "VWAP", price: data.vwap, cls: "vwap" });
  if (data.gamma_mid != null) levels.push({ label: "GAMMA MID (ZERO GAMMA)", price: data.gamma_mid, cls: "gmid", dash: true });
  (data.put_walls || []).forEach((w) => levels.push({ label: w.label, price: w.strike, cls: "pw" }));
  if (data.expected_move?.lower) levels.push({ label: "LOWER EXPECTED MOVE", price: data.expected_move.lower, cls: "emdn", dash: true });

  const prices = [...levels.map((l) => l.price), data.spot].filter((p) => p != null);
  if (!prices.length) return null;
  let hi = Math.max(...prices), lo = Math.min(...prices);
  const pad = (hi - lo) * 0.12 || 1;
  hi += pad; lo -= pad;

  const W = 760, H = 460, padR = 92, padL = 12, padT = 14, padB = 14;
  const y = (p) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);

  return (
    <svg className="gxd-ladder" viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {levels.map((l, i) => {
        const yy = y(l.price);
        const col = LV_COLOR[l.cls];
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={col} strokeWidth="1.6"
                  strokeDasharray={l.dash ? "6 4" : "none"} opacity="0.9" />
            <text x={padL + 4} y={yy - 4} fill={col} fontSize="10" fontWeight="600">{l.label}</text>
            <rect x={W - padR + 4} y={yy - 8} width={padR - 8} height="16" fill={col} rx="2" />
            <text x={W - 8} y={yy + 4} fill="#0d1117" fontSize="10" fontWeight="700" textAnchor="end">
              {l.price?.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* spot */}
      <line x1={padL} x2={W - padR} y1={y(data.spot)} y2={y(data.spot)}
            stroke={LV_COLOR.spot} strokeWidth="2.4" />
      <text x={padL + 4} y={y(data.spot) - 4} fill={LV_COLOR.spot} fontSize="11" fontWeight="700">
        {data.ticker} SPOT
      </text>
      <rect x={W - padR + 4} y={y(data.spot) - 9} width={padR - 8} height="18" fill={LV_COLOR.spot} rx="2" />
      <text x={W - 8} y={y(data.spot) + 4} fill="#0d1117" fontSize="11" fontWeight="700" textAnchor="end">
        {data.spot?.toFixed(2)}
      </text>
    </svg>
  );
}

export default function GexDashboard({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let on = true;
    const load = () => {
      setLoading(true);
      getGexDashboard(ticker)
        .then((d) => { if (on) { setData(d); setError(null); } })
        .catch((e) => { if (on) setError(e.response?.data?.error || e.message); })
        .finally(() => { if (on) setLoading(false); });
    };
    load();
    const id = setInterval(load, 30000);
    return () => { on = false; clearInterval(id); };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Building GEX dashboard…</p></div>;
  if (error) return <div className="card"><p className="err">GEX dashboard: {error}</p></div>;
  if (!data) return null;
  if (!data.available) {
    return <div className="card"><p className="muted">No option chain available for {ticker} — GEX needs live option data.</p></div>;
  }

  const s = data.signal || {};
  const a = data.alternate || {};
  const em = data.expected_move || {};
  const bull = data.above_flip === "BULLISH";

  return (
    <div className="gex-dash">
      {data.session_mode === "prior_session" && (
        <div className="gxd-replay-banner">
          ⏸ <b>Market closed</b> — replaying the previous open session
          {data.session_date ? ` (${data.session_date})` : ""}. VWAP, vol regime and
          delta pressure are from that session; live GEX resumes at the next market open.
        </div>
      )}

      {/* ── top metrics ── */}
      <div className="gxd-top">
        <Metric label="NET GAMMA" tone={data.regime === "positive" ? "pos" : "neg"}
                value={`${data.regime_label}`} sub={fmtM(data.net_gex_m)} />
        <Metric label="GEX FLIP LEVEL" value={data.flip_level?.toFixed(2)} />
        <Metric label="VWAP" tone="vwap" value={data.vwap?.toFixed(2) ?? "—"} />
        <Metric label="EXPECTED MOVE" tone="em"
                value={`±${em.dollars?.toFixed(2)}`} sub={`${em.pct?.toFixed(2)}%`} />
        <Metric label="VOL REGIME" tone="em" value={data.vol_regime} />
        <Metric label="DELTA PRESSURE" tone={data.delta_pressure === "BUYING" ? "pos" : data.delta_pressure === "SELLING" ? "neg" : ""}
                value={data.delta_pressure} />
        {data.session_mode === "prior_session"
          ? <Metric label="PRIOR SESSION" tone="em" value={data.session_date || "—"} />
          : <Metric label="TIME" value={data.time} />}
      </div>

      {/* ── ladder + sidebar ── */}
      <div className="gxd-body">
        <div className="gxd-chart">
          <LevelLadder data={data} />
        </div>
        <div className="gxd-side">
          <SideRow label="GEX REGIME" value={data.regime_label} tone={data.regime === "positive" ? "pos" : "neg"} />
          <SideRow label="MARKET CONDITION" value={data.market_condition} tone={data.market_condition === "SUPPORTIVE" ? "pos" : "neg"} />
          <SideRow label="DEALER BIAS" value={data.dealer_bias} tone="pos" />
          <SideRow label={`${data.ticker} PRICE`} value={`$${data.spot?.toFixed(2)}`} tone="pos" />
          <SideRow label="ABOVE FLIP" value={data.above_flip} tone={bull ? "pos" : "neg"} />
          <SideRow label="MAGNET" value={data.magnet} tone="vwap" />
          <SideRow label="NEXT KEY LEVEL" value={data.next_key_level ? `${data.next_key_level.price} ${data.next_key_level.label}` : "—"} tone="pos" />
          <SideRow label="KEY SUPPORT" value={`${data.key_support?.price} ${data.key_support?.label}`} />
          <SideRow label="NEXT KEY SUPPORT" value={data.next_key_support ? `${data.next_key_support.price} ${data.next_key_support.label}` : "—"} tone="neg" />
        </div>
      </div>

      {/* ── bottom signal strip ── */}
      <div className="gxd-bottom">
        <SignalBox title="TRADE SIGNAL" tone="pos">
          <div className="gxd-sig-main pos">{s.action}</div>
          <div className="gxd-strength"><span style={{ width: `${s.strength}%` }} /></div>
          <div className="gxd-sig-sub">strength {s.strength} / 100</div>
        </SignalBox>
        <SignalBox title="ALTERNATE SETUP">
          <div className="gxd-sig-main">{a.action}</div>
          <div className="gxd-strength"><span style={{ width: `${a.strength}%` }} /></div>
          <div className="gxd-sig-sub">strength {a.strength} / 100</div>
        </SignalBox>
        <SignalBox title="SCALP ZONE (LONG)" tone="pos">
          <div className="gxd-sig-main pos">{data.scalp_long?.zone?.join(" – ")}</div>
          <div className="gxd-sig-sub">T1 {data.scalp_long?.t1} · T2 {data.scalp_long?.t2}</div>
        </SignalBox>
        <SignalBox title="SCALP ZONE (SHORT)" tone="neg">
          <div className="gxd-sig-main neg">{data.scalp_short?.zone?.join(" – ")}</div>
          <div className="gxd-sig-sub">T1 {data.scalp_short?.t1} · T2 {data.scalp_short?.t2}</div>
        </SignalBox>
        <SignalBox title="INVALIDATION">
          <div className="gxd-sig-text">{data.invalidation}</div>
        </SignalBox>
        <SignalBox title="RISK MANAGEMENT" tone="em">
          <div className="gxd-sig-text">{data.risk_note}</div>
        </SignalBox>
        <SignalBox title="SQUEEZE ALERT" tone={data.squeeze_alert === "NONE" ? "" : "em"}>
          <div className="gxd-sig-text">{data.squeeze_alert}</div>
        </SignalBox>
        <SignalBox title="TRAP ALERT" tone={data.trap_alert === "NONE" ? "" : "em"}>
          <div className="gxd-sig-text">{data.trap_alert}</div>
        </SignalBox>
      </div>

      <p className="muted small">{data.note}</p>
    </div>
  );
}
