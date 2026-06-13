import { useEffect, useRef, useState } from "react";
import { BandaruChart } from "../chart/BandaruChart.js";
import { getCandles } from "../api.js";
import PivotStops from "./PivotStops.jsx";

// ET date in YYYY-MM-DD — used as a dependency so the chart automatically
// re-fetches when the calendar date rolls over (the previous build kept the
// stale pivots/CPR from yesterday until the user manually changed period).
function etDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default function ChartAnalysis({ ticker, analysis, refreshMs = 10000 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [interval, setInterval_] = useState("5m");
  const [period, setPeriod] = useState("3d");
  const [candleStyle, setCandleStyle] = useState(
    () => localStorage.getItem("bandaru_candle_style") || "regular");
  const [showCpr, setShowCpr] = useState(
    () => localStorage.getItem("bandaru_show_cpr") !== "false");
  const [cpr, setCpr] = useState(null);
  const [signals, setSignals] = useState([]);
  // Tracked separately from the auto-refresh setInterval so a midnight ET
  // rollover forces a fresh fetch with the new pivots even mid-session.
  const [today, setToday] = useState(() => etDateKey());

  // Date-rollover watcher. Polls every 30s, updates state when the ET date
  // string changes. Cheap, granular enough for "refresh at midnight", and
  // doesn't require timezone-math to schedule the exact rollover moment.
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = etDateKey();
      setToday((cur) => (cur === next ? cur : next));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Init chart once; tear it down on unmount so its DOM listener doesn't leak.
  useEffect(() => {
    if (canvasRef.current && !chartRef.current) {
      chartRef.current = new BandaruChart(canvasRef.current);
      chartRef.current.setCandleStyle(candleStyle);
      chartRef.current.setShowCpr(showCpr);
    }
    return () => {
      chartRef.current?.destroy?.();
      chartRef.current = null;
    };
  }, []);

  // Reload data when ticker / interval / period / refreshMs changes
  useEffect(() => {
    let cancelled = false;
    // Show a loading state immediately so the user sees something instead of
    // a black box while the first fetch is in flight.
    chartRef.current?.setStatus?.(`Loading ${ticker} ${interval}/${period}…`);
    const load = () => getCandles(ticker, { interval, period })
      .then((d) => {
        if (cancelled) return;
        setCpr(d.cpr || null);
        const bars = Array.isArray(d.bars) ? d.bars : [];
        if (!bars.length) {
          // /api/candles returns 200 with empty bars + an error map on failure
          // (e.g. Yahoo rate-limited). Render a useful message in the canvas.
          const err = d.errors?.bars || d.errors?.daily || d.error;
          chartRef.current?.setStatus?.(
            err
              ? `No chart data for ${ticker} — ${err}`
              : `No bars yet for ${ticker} (${interval}/${period}) — retrying…`,
          );
          return;
        }
        chartRef.current?.setStatus?.(null);
        chartRef.current?.setData({
          bars,
          pivots: d.pivots || analysis?.pivots || null,
          cpr: d.cpr || null,
          interval, period,
        });
        // After the chart has drawn, surface the buy/sell signals it
        // detected so the JSX below can render a "Signals" list.
        setSignals(chartRef.current?.getSignals?.() || []);
      })
      .catch((e) => {
        if (cancelled) return;
        chartRef.current?.setStatus?.(
          `Chart fetch failed — ${e?.message || "unknown error"}. Retrying…`,
        );
        setSignals([]);
      });
    load();
    const id = window.setInterval(load, refreshMs);
    return () => { cancelled = true; window.clearInterval(id); };
  // `today` is included so a midnight ET rollover triggers a fresh fetch
  // — the prior-day pivots / CPR depend on the date, not just the period.
  }, [ticker, interval, period, analysis, refreshMs, today]);

  // Update candle style live + remember the choice
  useEffect(() => {
    chartRef.current?.setCandleStyle(candleStyle);
    localStorage.setItem("bandaru_candle_style", candleStyle);
  }, [candleStyle]);

  // Toggle CPR overlay
  useEffect(() => {
    chartRef.current?.setShowCpr(showCpr);
    localStorage.setItem("bandaru_show_cpr", String(showCpr));
  }, [showCpr]);

  return (
    <div className="chart-wrap">
      <div className="chart-card">
        {/* Clean segmented controls — distinct sections for interval
            (candle resolution), range (window of history), candle style,
            CPR toggle, and zoom. Each section has its own uppercase label
            and a tight, joined button row. Subtle vertical dividers
            between sections so the two date controls don't blur into
            one long button strip. */}
        <div className="chart-controls">
          <div className="control-section">
            <span className="control-label">Interval</span>
            <div className="segmented">
              {["1m", "5m", "15m", "30m", "1h", "1d"].map((i) => (
                <button key={i}
                        className={interval === i ? "active" : ""}
                        onClick={() => setInterval_(i)}
                        title={`Candle interval: ${i}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="control-divider" />

          <div className="control-section">
            <span className="control-label">Range</span>
            <div className="segmented">
              {["1d", "2d", "3d", "5d", "1mo", "3mo", "6mo", "1y"].map((p) => (
                <button key={p}
                        className={period === p ? "active" : ""}
                        onClick={() => setPeriod(p)}
                        title={`Window of history: ${p}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="control-divider" />

          <div className="control-section">
            <span className="control-label">Style</span>
            <div className="segmented">
              {["regular", "heikin"].map((s) => (
                <button key={s}
                        className={candleStyle === s ? "active" : ""}
                        onClick={() => setCandleStyle(s)}>
                  {s === "regular" ? "Regular" : "Heikin"}
                </button>
              ))}
            </div>
          </div>

          <div className="control-divider" />

          <div className="control-section">
            <span className="control-label">Overlay</span>
            <div className="segmented">
              {/* Explicit On / Off label so the toggle state is unambiguous
                  at a glance — losing that text was a regression from the
                  earlier "CPR on" / "CPR off" wording. */}
              <button className={showCpr ? "active" : ""}
                      onClick={() => setShowCpr((v) => !v)}
                      title="Toggle CPR (Central Pivot Range) band">
                CPR {showCpr ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="control-divider" />

          <div className="control-section">
            <span className="control-label">Zoom</span>
            <div className="segmented">
              <button onClick={() => chartRef.current?.zoomBy(1.5)} title="Zoom out">−</button>
              <button onClick={() => chartRef.current?.zoomBy(0.7)} title="Zoom in">+</button>
              <button onClick={() => chartRef.current?.zoomReset()} title="Reset zoom">⤢</button>
            </div>
          </div>
        </div>
        <canvas ref={canvasRef} className="chart-canvas" />

        {/* Live signal strip — buy/sell arrows the chart class detected. */}
        {signals.length > 0 ? (
          <div className="chart-signal-strip">
            <span className="strip-label">Signals</span>
            {signals.slice(-8).reverse().map((s, idx) => {
              const t = s.time ? new Date(s.time).toLocaleTimeString([], {
                hour: "2-digit", minute: "2-digit",
              }) : "";
              return (
                <span key={idx} className={`sig-chip sig-${s.type}`}>
                  {s.type === "buy" ? "BUY" : "SELL"} @ {s.level}
                  {" "}({s.price?.toFixed(2)})
                  {t ? <span className="sig-time"> · {t}</span> : null}
                </span>
              );
            })}
          </div>
        ) : null}

        {/* CPR readout — only when the toggle is ON. If CPR data isn't
            available (prior day failed to load), show a placeholder so
            the user understands the toggle worked but the data layer
            didn't return anything. Avoids the earlier silent-empty case
            where toggling CPR "on" appeared to do nothing. */}
        {showCpr ? (
          cpr ? (
            <div className="cpr-readout">
              <span className="cpr-chip cpr-edge">TC ${cpr.tc?.toFixed(2)}</span>
              <span className="cpr-chip cpr-pivot">Pivot ${cpr.pivot?.toFixed(2)}</span>
              <span className="cpr-chip cpr-edge">BC ${cpr.bc?.toFixed(2)}</span>
              <span className={`cpr-chip cpr-type cpr-${cpr.type}`}>
                {cpr.type} CPR ({cpr.width_pct?.toFixed(2)}%) — {cpr.bias}
              </span>
            </div>
          ) : (
            <div className="cpr-readout">
              <span className="cpr-chip cpr-unavailable">
                CPR data unavailable — waiting for prior-day OHLC
              </span>
            </div>
          )
        ) : null}
      </div>
      <PivotStops ticker={ticker} />
    </div>
  );
}
