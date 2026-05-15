import { useEffect, useState } from "react";
import { listTrades, createTrade, closeTrade, deleteTrade } from "../api.js";

export default function TradeJournal() {
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState({
    type: "CALL", strike: "", entry_price: "", qty: 1, expiration: "",
    platform: "", notes: "",
  });

  const load = () => listTrades("all").then((d) => setTrades(d.trades || [])).catch(console.warn);
  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    await createTrade({ ...form, strike: +form.strike, entry_price: +form.entry_price, qty: +form.qty });
    setForm({ type: "CALL", strike: "", entry_price: "", qty: 1, expiration: "", platform: "", notes: "" });
    load();
  };

  const onClose = async (id) => {
    const exit = prompt("Exit premium per contract?");
    if (exit) { await closeTrade(id, +exit); load(); }
  };
  const onDelete = async (id) => { if (confirm("Delete?")) { await deleteTrade(id); load(); } };

  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status === "closed");

  return (
    <div className="card">
      <h2>Trade Journal (MongoDB-backed)</h2>
      <form onSubmit={onSubmit} className="trade-form">
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="CALL">CALL</option>
          <option value="PUT">PUT</option>
        </select>
        <input placeholder="Strike" value={form.strike} onChange={(e) => setForm({ ...form, strike: e.target.value })} required />
        <input placeholder="Entry $" value={form.entry_price} onChange={(e) => setForm({ ...form, entry_price: e.target.value })} required />
        <input placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        <input type="date" value={form.expiration} onChange={(e) => setForm({ ...form, expiration: e.target.value })} required />
        <input placeholder="Platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} />
        <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button type="submit">+ Log Open Trade</button>
      </form>

      <h3>Open Trades ({open.length})</h3>
      <table className="trade-table">
        <thead><tr><th>Type</th><th>Strike</th><th>Exp</th><th>Qty</th><th>Entry</th><th>Platform</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          {open.map((t) => (
            <tr key={t._id}>
              <td>{t.type}</td><td>{t.strike}</td><td>{t.expiration}</td><td>{t.qty}</td>
              <td>${t.entry_price}</td><td>{t.platform}</td><td>{t.notes}</td>
              <td><button onClick={() => onClose(t._id)}>Close</button> <button onClick={() => onDelete(t._id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Closed ({closed.length})</h3>
      <table className="trade-table">
        <thead><tr><th>Type</th><th>Strike</th><th>Entry</th><th>Exit</th><th>P&L</th><th></th></tr></thead>
        <tbody>
          {closed.map((t) => {
            const pl = ((t.exit_price - t.entry_price) * t.qty * 100).toFixed(2);
            return (
              <tr key={t._id}>
                <td>{t.type}</td><td>{t.strike}</td>
                <td>${t.entry_price}</td><td>${t.exit_price}</td>
                <td className={pl >= 0 ? "up" : "down"}>${pl}</td>
                <td><button onClick={() => onDelete(t._id)}>✕</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
