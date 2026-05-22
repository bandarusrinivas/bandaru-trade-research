import { useEffect, useState } from "react";
import { getWatchlist } from "../api.js";

const DEFAULT = ["SPY", "QQQ", "IWM", "DIA", "^VIX", "VXX",
  "NVDA", "AAPL", "MSFT", "GOOGL", "META", "TSLA", "AMZN", "AMD"];

export default function Watchlist({ onPickTicker, refreshMs = 10000 }) {
  const [symbols, setSymbols] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bandaru_watchlist")) || DEFAULT; }
    catch { return DEFAULT; }
  });
  const [add, setAdd] = useState("");
  const [quotes, setQuotes] = useState([]);

  const load = () => getWatchlist(symbols).then((d) => setQuotes(d.quotes || [])).catch(console.warn);
  useEffect(() => {
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [symbols.join(","), refreshMs]);
  useEffect(() => { localStorage.setItem("bandaru_watchlist", JSON.stringify(symbols)); }, [symbols]);

  const onAdd = (e) => {
    e.preventDefault();
    const s = add.trim().toUpperCase();
    if (s && !symbols.includes(s)) setSymbols([...symbols, s]);
    setAdd("");
  };
  const remove = (s) => setSymbols(symbols.filter((x) => x !== s));

  return (
    <div className="card">
      <h2>Watchlist — multi-symbol live quotes</h2>
      <div className="watchlist-controls">
        <form onSubmit={onAdd}>
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add symbol (e.g. NFLX, ^DJI, BTC-USD)" maxLength={12} />
          <button type="submit">+ Add</button>
        </form>
        <button className="ghost" onClick={() => setSymbols(DEFAULT)}>Reset</button>
        <button className="ghost" onClick={load}>Refresh now</button>
        <span className="muted">Click a tile to switch the dashboard.</span>
      </div>
      <div className="watchlist-grid">
        {quotes.map((q) => (
          <div key={q.symbol} className={`watchlist-tile ${q.change >= 0 ? "up" : "down"}`}
            onClick={() => q.price && onPickTicker?.(q.symbol)}>
            <div className="wt-head">
              <span className="wt-symbol">{q.symbol}</span>
              <button className="wt-remove" onClick={(e) => { e.stopPropagation(); remove(q.symbol); }}>✕</button>
            </div>
            {q.error ? (
              <div className="wt-error muted">unavailable</div>
            ) : (
              <>
                <div className="wt-price">${q.price?.toFixed(2)}</div>
                <div className={`wt-change ${q.change >= 0 ? "up" : "down"}`}>
                  {q.change >= 0 ? "▲" : "▼"} {q.change?.toFixed(2)} ({q.change_pct?.toFixed(2)}%)
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
