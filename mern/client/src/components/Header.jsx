import { useState } from "react";

const PRESETS = ["SPY", "QQQ", "IWM", "NVDA", "TSLA", "AAPL"];
const REFRESH_OPTIONS = [
  { label: "5s",  ms: 5_000 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
];

export default function Header({ ticker, setTicker, analysis, refreshMs, setRefreshMs }) {
  const [draft, setDraft] = useState(ticker);
  const onGo = () => setTicker(draft.trim().toUpperCase() || "SPY");

  const price = analysis?.spy?.price;
  const chg = analysis?.spy?.change;
  const chgPct = analysis?.spy?.change_pct;
  const verdict = analysis?.recommendations?.[0];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">Bandaru</span>
        <span className="tag">Trade Research</span>
      </div>
      <div className="ticker-picker">
        <label>Ticker</label>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={10} />
        <button onClick={onGo}>Go</button>
        <span className="presets">
          {PRESETS.map((t) => (
            <button key={t} onClick={() => { setDraft(t); setTicker(t); }}>{t}</button>
          ))}
        </span>
      </div>
      <div className="refresh-picker" title="Auto-refresh interval">
        <label>Refresh</label>
        {REFRESH_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={refreshMs === opt.ms ? "active" : ""}
            onClick={() => setRefreshMs?.(opt.ms)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="quote">
        <span className="ticker">{ticker}</span>
        <span className="price">{price ? `$${price.toFixed(2)}` : "—"}</span>
        {chg != null && (
          <span className={chg >= 0 ? "change up" : "change down"}>
            {chg >= 0 ? "▲" : "▼"} {chg.toFixed(2)} ({chgPct?.toFixed(2)}%)
          </span>
        )}
      </div>
      {verdict && (
        <div className={`master-verdict ${verdict.direction}`}>
          <strong>{verdict.direction === "bullish" ? "BULLISH" : "BEARISH"}</strong>
          <span className="action">{verdict.direction === "bullish" ? "GO LONG" : "GO SHORT"}</span>
          <span>{verdict.reasoning}</span>
        </div>
      )}
    </header>
  );
}
