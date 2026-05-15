export default function ProSignals({ analysis }) {
  if (!analysis) return <div className="empty">Loading…</div>;
  const ind = analysis.indicators || {};
  const adx = ind.adx || {};
  const macd = ind.macd || {};
  const emas = ind.emas || {};
  const last = analysis.spy?.price;

  // Determine stack
  const stacked = emas.ema8 && emas.ema21 && emas.ema50 && last;
  const above = stacked
    ? (last > emas.ema8 && emas.ema8 > emas.ema21 && emas.ema21 > emas.ema50)
    : null;
  const below = stacked
    ? (last < emas.ema8 && emas.ema8 < emas.ema21 && emas.ema21 < emas.ema50)
    : null;
  const stackLabel = above ? "Strong Bullish Stack" : below ? "Strong Bearish Stack" : "Mixed";

  return (
    <div className="alerts-grid">
      <div className="card">
        <h2>Stacked EMA (D8 · D21 · D50)</h2>
        <div className={`status ${above ? "bullish" : below ? "bearish" : "neutral"}`}>{stackLabel}</div>
        <table className="kv-table">
          <tbody>
            <tr><td>Last close</td><td>${last?.toFixed(2)}</td></tr>
            <tr><td>EMA 8</td><td>${emas.ema8?.toFixed(2) ?? "—"}</td></tr>
            <tr><td>EMA 21</td><td>${emas.ema21?.toFixed(2) ?? "—"}</td></tr>
            <tr><td>EMA 50</td><td>${emas.ema50?.toFixed(2) ?? "—"}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>ADX — Trend Strength</h2>
        <div className={`status ${adx.trend === "Bullish" ? "bullish" : adx.trend === "Bearish" ? "bearish" : "neutral"}`}>
          {adx.strength || "—"} {adx.trend || ""} Trend (ADX {adx.adx ?? "—"})
        </div>
        <table className="kv-table">
          <tbody>
            <tr><td>ADX (14)</td><td>{adx.adx ?? "—"}</td></tr>
            <tr><td>+DI</td><td className="up">{adx.plus_di ?? "—"}</td></tr>
            <tr><td>-DI</td><td className="down">{adx.minus_di ?? "—"}</td></tr>
            <tr><td>Trend</td><td>{adx.trend ?? "—"}</td></tr>
            <tr><td>Strength</td><td>{adx.strength ?? "—"}</td></tr>
          </tbody>
        </table>
        <p className="muted small">ADX &gt; 25 = strong trend · ADX &lt; 20 = ranging market</p>
      </div>

      <div className="card">
        <h2>MACD (12, 26, 9)</h2>
        <div className={`status ${macd.trend === "bullish" ? "bullish" : macd.trend === "bearish" ? "bearish" : "neutral"}`}>
          {(macd.trend || "neutral").toUpperCase()}
        </div>
        <table className="kv-table">
          <tbody>
            <tr><td>MACD</td><td>{macd.macd?.toFixed(3) ?? "—"}</td></tr>
            <tr><td>Signal</td><td>{macd.signal?.toFixed(3) ?? "—"}</td></tr>
            <tr><td>Histogram</td><td className={macd.histogram >= 0 ? "up" : "down"}>{macd.histogram?.toFixed(3) ?? "—"}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>RSI (14)</h2>
        <div className={`status ${ind.rsi > 70 ? "bearish" : ind.rsi < 30 ? "bullish" : "neutral"}`}>
          {ind.rsi == null ? "—" : ind.rsi > 70 ? "Overbought" : ind.rsi < 30 ? "Oversold" : "Neutral"} ({ind.rsi?.toFixed(1)})
        </div>
        <p className="muted small">RSI &gt; 70 overbought (mean-revert risk) · RSI &lt; 30 oversold (bounce opportunity)</p>
      </div>
    </div>
  );
}
