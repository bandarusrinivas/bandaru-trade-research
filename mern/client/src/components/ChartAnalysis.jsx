import { useEffect, useRef, useState } from "react";
import { BandaruChart } from "../chart/BandaruChart.js";
import { getCandles } from "../api.js";
import PivotStops from "./PivotStops.jsx";

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
    const load = () => getCandles(ticker, { interval, period })
      .then((d) => {
        if (cancelled) return;
        setCpr(d.cpr || null);
        chartRef.current?.setData({
          bars: d.bars || [],
          pivots: d.pivots || analysis?.pivots || null,
          cpr: d.cpr || null,
          interval, period,
        });
      })
      .catch(console.warn);
    load();
    const id = window.setInterval(load, refreshMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [ticker, interval, period, analysis, refreshMs]);

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
        <div className="chart-controls">
          <div className="control-group">
            {["1m", "5m", "15m", "30m", "1h", "1d"].map((i) => (
              <button key={i} className={interval === i ? "active" : ""} onClick={() => setInterval_(i)}>{i}</button>
            ))}
          </div>
          <div className="control-group">
            {["1d", "2d", "3d", "5d", "1mo", "3mo", "6mo", "1y"].map((p) => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <div className="control-group">
            {["regular", "heikin"].map((s) => (
              <button key={s} className={candleStyle === s ? "active" : ""} onClick={() => setCandleStyle(s)}>
                {s === "regular" ? "Regular" : "Heikin-Ashi"}
              </button>
            ))}
          </div>
          <div className="control-group">
            <button className={showCpr ? "active" : ""} onClick={() => setShowCpr((v) => !v)}>
              CPR {showCpr ? "on" : "off"}
            </button>
          </div>
          <div className="control-group">
            <button onClick={() => chartRef.current?.zoomBy(1.5)}>−</button>
            <button onClick={() => chartRef.current?.zoomBy(0.7)}>+</button>
            <button onClick={() => chartRef.current?.zoomReset()}>⤢</button>
          </div>
        </div>
        <canvas ref={canvasRef} className="chart-canvas" />
        {cpr ? (
          <div className="cpr-readout">
            <span className="cpr-chip cpr-edge">TC ${cpr.tc?.toFixed(2)}</span>
            <span className="cpr-chip cpr-pivot">Pivot ${cpr.pivot?.toFixed(2)}</span>
            <span className="cpr-chip cpr-edge">BC ${cpr.bc?.toFixed(2)}</span>
            <span className={`cpr-chip cpr-type cpr-${cpr.type}`}>
              {cpr.type} CPR ({cpr.width_pct?.toFixed(2)}%) — {cpr.bias}
            </span>
          </div>
        ) : null}
      </div>
      <PivotStops ticker={ticker} />
    </div>
  );
}
