import { useEffect, useRef, useState } from "react";
import { BandaruChart } from "../chart/BandaruChart.js";
import { getCandles } from "../api.js";

export default function ChartAnalysis({ ticker, analysis }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [interval, setInterval_] = useState("5m");
  const [period, setPeriod] = useState("3d");
  const [candleStyle, setCandleStyle] = useState("heikin");

  // Init chart once
  useEffect(() => {
    if (canvasRef.current && !chartRef.current) {
      chartRef.current = new BandaruChart(canvasRef.current);
      chartRef.current.setCandleStyle(candleStyle);
    }
  }, []);

  // Reload data when ticker / interval / period changes
  useEffect(() => {
    let cancelled = false;
    const load = () => getCandles(ticker, { interval, period })
      .then((d) => {
        if (cancelled) return;
        chartRef.current?.setData({
          bars: d.bars || [],
          pivots: d.pivots || analysis?.pivots || null,
          interval, period,
        });
      })
      .catch(console.warn);
    load();
    const id = window.setInterval(load, 10000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [ticker, interval, period, analysis]);

  // Update candle style live
  useEffect(() => { chartRef.current?.setCandleStyle(candleStyle); }, [candleStyle]);

  return (
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
          <button onClick={() => chartRef.current?.zoomBy(1.5)}>−</button>
          <button onClick={() => chartRef.current?.zoomBy(0.7)}>+</button>
          <button onClick={() => chartRef.current?.zoomReset()}>⤢</button>
        </div>
      </div>
      <canvas ref={canvasRef} className="chart-canvas" />
    </div>
  );
}
