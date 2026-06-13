import { useEffect, useState } from "react";
import { getVexDashboard } from "../api.js";

// VEX Dashboard — dealer Vanna Exposure (∂Δ/∂σ) view.
// Parallel to GexDashboard but reads from /api/vex-dashboard. Layout is
// identical so it reuses the .gxd-* classes; only labels and the numeric
// field names differ (net_vex_m / vanna_mid in place of net_gex_m / gamma_mid).

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

function LevelLadder({ data }) {
  const items = [];
  (data.call_walls || []).forEach((w) => items.push({ label: w.label, price: w.strike, cls: "cw" }));
  if (data.expected_move?.upper != null) items.push({ label: "UPPER EXPECTED MOVE", price: data.expected_move.upper, cls: "em", dash: true });
  if (data.flip_level != null) items.push({ label: "VEX FLIP LEVEL", price: data.flip_level, cls: "flip" });
  if (data.vwap != null) items.push({ label: "VWAP", price: data.vwap, cls: "vwap" });
  if (data.vanna_mid != null) items.push({ label: "VANNA MID (ZERO VANNA)", price: data.vanna_mid, cls: "gmid", dash: true });
  (data.put_walls || []).forEach((w) => items.push({ label: w.label, price: w.strike, cls: "pw" }));
  if (data.expected_move?.lower != null) items.push({ label: "LOWER EXPECTED MOVE", price: data.expected_move.lower, cls: "emdn", dash: true });
  if (data.spot != null) items.push({ label: `${data.ticker} SPOT`, price: data.spot, cls: "spot", isSpot: true });

  if (!items.length) return null;
  items.sort((a, b) => b.price - a.price);
  const spot = data.spot;

  return (
    <div className="gxd-ladder">
      {items.map((l, i) => {
        const col = LV_COLOR[l.cls];
        const dist = spot != null ? l.price - spot : null;
        const distPct = spot != null && spot !== 0 ? (dist / spot) * 100 : null;
        const distStr = dist == null || l.isSpot
          ? ""
          : `${dist >= 0 ? "+" : ""}${dist.toFixed(2)} (${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%)`;
        return (
          <div
            key={i}
            className={`gxd-rung ${l.isSpot ? "is-spot" : ""} ${l.dash ? "is-dashed" : ""}`}
            style={{ "--rung-color": col }}
          >
            <div className="gxd-rung-label">{l.label}</div>
            <div className="gxd-rung-line" />
            <div className="gxd-rung-dist">{distStr}</div>
            <div className="gxd-rung-chip">{l.price.toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function VexDashboard({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let on = true;
    const load = () => {
      setLoading(true);
      getVexDashboard(ticker)
        .then((d) => { if (on) { setData(d); setError(null); } })
        .catch((e) => { if (on) setError(e.response?.data?.error || e.message); })
        .finally(() => { if (on) setLoading(false); });
    };
    load();
    const id = setInterval(load, 30000);
    return () => { on = false; clearInterval(id); };
  }, [ticker]);

  if (loading && !data) return <div className="card"><p className="muted">Building VEX dashboard…</p></div>;
  if (error) return <div className="card"><p className="err">VEX dashboard: {error}</p></div>;
  if (!data) return null;
  if (!data.available) {
    return <div className="card"><p className="muted">No option chain available for {ticker} — VEX needs live option data.</p></div>;
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
          delta pressure are from that session; live VEX resumes at the next market open.
        </div>
      )}

      <div className="gxd-top">
        <Metric label="NET VANNA" tone={data.regime === "positive" ? "pos" : "neg"}
                value={`${data.regime_label}`} sub={fmtM(data.net_vex_m)} />
        <Metric label="VEX FLIP LEVEL" value={data.flip_level?.toFixed(2)} />
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

      <div className="gxd-body">
        <div className="gxd-chart">
          <LevelLadder data={data} />
        </div>
        <div className="gxd-side">
          <SideRow label="VEX REGIME" value={data.regime_label} tone={data.regime === "positive" ? "pos" : "neg"} />
          <SideRow label="MARKET CONDITION" value={data.market_condition} tone={data.regime === "positive" ? "pos" : "neg"} />
          <SideRow label="DEALER BIAS" value={data.dealer_bias} tone="pos" />
          <SideRow label={`${data.ticker} PRICE`} value={`$${data.spot?.toFixed(2)}`} tone="pos" />
          <SideRow label="ABOVE FLIP" value={data.above_flip} tone={bull ? "pos" : "neg"} />
          <SideRow label="MAGNET" value={data.magnet} tone="vwap" />
          <SideRow label="NEXT KEY LEVEL" value={data.next_key_level ? `${data.next_key_level.price} ${data.next_key_level.label}` : "—"} tone="pos" />
          <SideRow label="KEY SUPPORT" value={`${data.key_support?.price} ${data.key_support?.label}`} />
          <SideRow label="NEXT KEY SUPPORT" value={data.next_key_support ? `${data.next_key_support.price} ${data.next_key_support.label}` : "—"} tone="neg" />
        </div>
      </div>

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
