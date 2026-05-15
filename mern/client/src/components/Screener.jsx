import { useState } from "react";
import { getScreener } from "../api.js";

const DEFAULT = "SPY,QQQ,IWM,DIA,AAPL,MSFT,GOOGL,META,NVDA,AMD,TSLA,AMZN,JPM,BAC,XOM,UNH";

export default function Screener({ onPickTicker }) {
  const [input, setInput] = useState(() => localStorage.getItem("bandaru_screener") || DEFAULT);
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("Ready to scan.");
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    const symbols = input.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return;
    setScanning(true);
    setStatus(`Scanning ${symbols.length} symbols…`);
    localStorage.setItem("bandaru_screener", symbols.join(","));
    try {
      const data = await getScreener(symbols);
      setResults(data.results);
      setStatus(`${data.count} symbols · ${data.elapsed_ms}ms`);
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  const filtered = results.filter((r) => {
    if (filter === "bull") return r.direction === "bull";
    if (filter === "bear") return r.direction === "bear";
    if (filter === "actionable") return (r.score || 0) >= 65;
    if (filter === "strong") return (r.score || 0) >= 85;
    return true;
  });

  return (
    <div className="card">
      <h2>Stock Screener — Find Entry Opportunities</h2>
      <p className="muted">Scans your list for actionable setups. Click a row to switch the dashboard to that ticker.</p>

      <div className="screener-controls">
        <input className="screener-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="SPY, QQQ, AAPL, …" />
        <button className="primary" onClick={scan} disabled={scanning}>🔍 Scan</button>
        <button className="ghost" onClick={() => setInput(DEFAULT)}>Reset</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="bull">Bullish only</option>
          <option value="bear">Bearish only</option>
          <option value="actionable">Actionable ≥65</option>
          <option value="strong">Strong only ≥85</option>
        </select>
        <span className="status">{status}</span>
      </div>

      <table className="screener-table">
        <thead>
          <tr>
            <th>Score</th><th>Ticker</th><th>Price</th><th>Δ%</th>
            <th>Opportunity</th><th>Why</th><th>RSI</th><th>ADX</th><th>Trend</th><th>Vol×</th>
          </tr>
        </thead>
        <tbody>
          {!filtered.length ? (
            <tr><td colSpan={10} className="empty">No matches — click "🔍 Scan" to start.</td></tr>
          ) : filtered.map((r) => (
            <tr key={r.ticker} onClick={() => r.ticker && onPickTicker?.(r.ticker)}
              className={r.error ? "error" : ""}>
              <td className={`score score-${r.score >= 85 ? "strong" : r.score >= 65 ? "go" : r.score >= 40 ? "watch" : "none"}`}>{r.score || 0}</td>
              <td className="ticker"><b>{r.ticker}</b></td>
              <td>${r.price?.toFixed(2) || "—"}</td>
              <td className={r.change_pct >= 0 ? "up" : "down"}>{r.change_pct?.toFixed(2) || 0}%</td>
              <td><span className={`opp ${r.direction}`}>{r.opportunity || r.error}</span></td>
              <td className="why">{r.why || ""}</td>
              <td>{r.rsi ?? "—"}</td>
              <td>{r.adx ?? "—"}</td>
              <td>{r.trend || "—"}</td>
              <td>{r.volume_x_avg ? r.volume_x_avg + "×" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
