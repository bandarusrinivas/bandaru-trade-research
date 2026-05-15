import { useEffect, useState } from "react";
import { getChain } from "../api.js";

export default function OptionsChain({ ticker }) {
  const [chain, setChain] = useState([]);
  const [price, setPrice] = useState(null);

  useEffect(() => {
    getChain(ticker).then((d) => {
      setChain(d.chain || []);
      setPrice(d.current_price);
    }).catch(console.warn);
  }, [ticker]);

  // ±2% around current price
  const lo = price ? price * 0.98 : 0;
  const hi = price ? price * 1.02 : Infinity;
  const filtered = chain.filter((c) => c.strike >= lo && c.strike <= hi);

  // Group by strike — calls left, puts right
  const byStrike = new Map();
  for (const c of filtered) {
    if (!byStrike.has(c.strike)) byStrike.set(c.strike, { call: null, put: null });
    byStrike.get(c.strike)[c.type] = c;
  }
  const rows = Array.from(byStrike.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="card">
      <h2>0DTE Options Chain (±2% strikes)</h2>
      <p className="muted">Current price: <strong>${price?.toFixed(2) ?? "—"}</strong></p>
      <table className="chain-table">
        <thead>
          <tr className="chain-header">
            <th colSpan={5} className="calls">◀ CALLS</th>
            <th className="strike">STRIKE</th>
            <th colSpan={5} className="puts">PUTS ▶</th>
          </tr>
          <tr>
            <th>Vol</th><th>OI</th><th>IV</th><th>Mid</th><th>Bid×Ask</th>
            <th>Strike</th>
            <th>Bid×Ask</th><th>Mid</th><th>IV</th><th>OI</th><th>Vol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([strike, { call, put }]) => {
            const isATM = price && Math.abs(strike - price) === Math.min(...rows.map(([s]) => Math.abs(s - price)));
            return (
              <tr key={strike} className={isATM ? "atm" : ""}>
                <td>{call?.volume ?? "—"}</td>
                <td>{call?.open_interest ?? "—"}</td>
                <td>{call?.iv ? call.iv.toFixed(1) + "%" : "—"}</td>
                <td>${call?.mid?.toFixed(2) ?? "—"}</td>
                <td className="muted">{call ? `$${call.bid?.toFixed(2)} × $${call.ask?.toFixed(2)}` : "—"}</td>
                <td className="strike-cell"><b>{strike}</b></td>
                <td className="muted">{put ? `$${put.bid?.toFixed(2)} × $${put.ask?.toFixed(2)}` : "—"}</td>
                <td>${put?.mid?.toFixed(2) ?? "—"}</td>
                <td>{put?.iv ? put.iv.toFixed(1) + "%" : "—"}</td>
                <td>{put?.open_interest ?? "—"}</td>
                <td>{put?.volume ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No 0DTE chain data — try later in the trading day.</div>}
    </div>
  );
}
