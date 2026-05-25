import { useEffect, useState } from "react";
import { listTrades, createTrade, updateTrade, deleteTrade } from "../api.js";

const BLANK = {
  ticker: "", account_no: "", entry_date: "", exit_date: "", bias: "Bullish",
  strategy: "", qty: "1", entry_price: "", stop_loss: "", estimated_exit: "",
  actual_exit: "", pnl_amount: "", entry_reason: "", exit_reason: "",
  lesson: "", status: "open",
};

const num = (v) => (v === "" || v == null ? null : Number(v));
const money = (v) => (v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

function daysIn(t) {
  if (!t.entry_date) return "—";
  const end = t.exit_date ? new Date(t.exit_date) : new Date();
  const d = Math.round((end - new Date(t.entry_date)) / 86400000);
  return isFinite(d) && d >= 0 ? d : "—";
}
function pnlPct(t) {
  if (t.entry_price == null || t.actual_exit == null || !t.entry_price) return null;
  return ((t.actual_exit - t.entry_price) / t.entry_price) * 100;
}

export default function TradeJournal() {
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => listTrades("all").then((d) => setTrades(d.trades || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    const payload = {
      ticker: form.ticker, account_no: form.account_no,
      entry_date: form.entry_date, exit_date: form.exit_date,
      bias: form.bias, strategy: form.strategy, status: form.status,
      qty: num(form.qty) ?? 1,
      entry_price: num(form.entry_price), stop_loss: num(form.stop_loss),
      estimated_exit: num(form.estimated_exit), actual_exit: num(form.actual_exit),
      pnl_amount: num(form.pnl_amount),
      entry_reason: form.entry_reason, exit_reason: form.exit_reason, lesson: form.lesson,
    };
    try {
      if (editId) await updateTrade(editId, payload);
      else await createTrade(payload);
      setForm(BLANK); setEditId(null); load();
    } catch (e2) { setErr(e2.response?.data?.error || e2.message); }
  };

  const onEdit = (t) => {
    setEditId(t._id);
    setForm({
      ticker: t.ticker || "", account_no: t.account_no || "", entry_date: t.entry_date || "",
      exit_date: t.exit_date || "", bias: t.bias || "Bullish", strategy: t.strategy || "",
      qty: t.qty ?? 1, entry_price: t.entry_price ?? "", stop_loss: t.stop_loss ?? "",
      estimated_exit: t.estimated_exit ?? "", actual_exit: t.actual_exit ?? "",
      pnl_amount: t.pnl_amount ?? "", entry_reason: t.entry_reason || "",
      exit_reason: t.exit_reason || "", lesson: t.lesson || "", status: t.status || "open",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onCancel = () => { setForm(BLANK); setEditId(null); };
  const onDelete = async (id) => {
    if (confirm("Delete this trade?")) { await deleteTrade(id); load(); }
  };

  const withPnl = trades.filter((t) => t.pnl_amount != null);
  const totalPnl = withPnl.reduce((s, t) => s + t.pnl_amount, 0);
  const wins = withPnl.filter((t) => t.pnl_amount > 0).length;

  return (
    <div className="card tj">
      <h2>Trade Journal</h2>
      <p className="muted small">
        MongoDB-backed · survives restarts. Days held and P/L % are computed; P/L $ is the figure you record.
      </p>

      <form onSubmit={onSubmit} className="tj-form">
        <div className="tj-grid">
          <label>Ticker<input value={form.ticker} onChange={(e) => set("ticker", e.target.value)} /></label>
          <label>Account no<input value={form.account_no} onChange={(e) => set("account_no", e.target.value)} /></label>
          <label>Entry date<input type="date" value={form.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
          <label>Exit date<input type="date" value={form.exit_date} onChange={(e) => set("exit_date", e.target.value)} /></label>
          <label>Bias
            <select value={form.bias} onChange={(e) => set("bias", e.target.value)}>
              <option>Bullish</option><option>Bearish</option><option>Neutral</option>
            </select>
          </label>
          <label>Stock / Option strategy
            <input value={form.strategy} onChange={(e) => set("strategy", e.target.value)}
                   placeholder="Long Call, Iron Condor, Stock…" />
          </label>
          <label>Qty<input type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)} /></label>
          <label>Entry price<input type="number" step="0.01" value={form.entry_price} onChange={(e) => set("entry_price", e.target.value)} /></label>
          <label>Stop loss<input type="number" step="0.01" value={form.stop_loss} onChange={(e) => set("stop_loss", e.target.value)} /></label>
          <label>Estimated exit<input type="number" step="0.01" value={form.estimated_exit} onChange={(e) => set("estimated_exit", e.target.value)} /></label>
          <label>Actual exit<input type="number" step="0.01" value={form.actual_exit} onChange={(e) => set("actual_exit", e.target.value)} /></label>
          <label>P/L amount $<input type="number" step="0.01" value={form.pnl_amount} onChange={(e) => set("pnl_amount", e.target.value)} /></label>
          <label>Status
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="open">open</option><option value="closed">closed</option>
            </select>
          </label>
        </div>
        <div className="tj-reasons">
          <label>Entry reason<textarea rows={2} value={form.entry_reason} onChange={(e) => set("entry_reason", e.target.value)} /></label>
          <label>Exit reason<textarea rows={2} value={form.exit_reason} onChange={(e) => set("exit_reason", e.target.value)} /></label>
          <label>Lesson learned<textarea rows={2} value={form.lesson} onChange={(e) => set("lesson", e.target.value)} /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="tj-form-actions">
          <button type="submit" className="primary">{editId ? "Save changes" : "+ Add trade"}</button>
          {editId && <button type="button" onClick={onCancel}>Cancel edit</button>}
        </div>
      </form>

      <div className="tj-summary">
        <span><b>{trades.length}</b> trades logged</span>
        <span>Realized P/L <b className={totalPnl >= 0 ? "up" : "down"}>{money(totalPnl)}</b></span>
        <span>Win rate <b>{withPnl.length ? Math.round((wins / withPnl.length) * 100) : 0}%</b> ({wins}/{withPnl.length})</span>
      </div>

      <div className="tj-table-wrap">
        <table className="tj-table">
          <thead>
            <tr>
              <th>Ticker</th><th>Account</th><th>Entry</th><th>Exit</th><th>Days</th>
              <th>Bias</th><th>Strategy</th><th>Entry $</th><th>Stop</th><th>Est. exit</th>
              <th>Actual exit</th><th>P/L $</th><th>P/L %</th><th>Entry reason</th>
              <th>Exit reason</th><th>Lesson</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const pct = pnlPct(t);
              return (
                <tr key={t._id}>
                  <td className="tj-tk">{t.ticker || "—"}</td>
                  <td>{t.account_no || "—"}</td>
                  <td>{t.entry_date || "—"}</td>
                  <td>{t.exit_date || "—"}</td>
                  <td>{daysIn(t)}</td>
                  <td className={t.bias === "Bullish" ? "up" : t.bias === "Bearish" ? "down" : ""}>{t.bias || "—"}</td>
                  <td>{t.strategy || "—"}</td>
                  <td>{t.entry_price ?? "—"}</td>
                  <td>{t.stop_loss ?? "—"}</td>
                  <td>{t.estimated_exit ?? "—"}</td>
                  <td>{t.actual_exit ?? "—"}</td>
                  <td className={t.pnl_amount == null ? "" : t.pnl_amount >= 0 ? "up" : "down"}>
                    {t.pnl_amount == null ? "—" : money(t.pnl_amount)}
                  </td>
                  <td className={pct == null ? "" : pct >= 0 ? "up" : "down"}>
                    {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                  </td>
                  <td className="tj-text" title={t.entry_reason}>{t.entry_reason || "—"}</td>
                  <td className="tj-text" title={t.exit_reason}>{t.exit_reason || "—"}</td>
                  <td className="tj-text" title={t.lesson}>{t.lesson || "—"}</td>
                  <td>{t.status}</td>
                  <td className="tj-actions">
                    <button onClick={() => onEdit(t)}>Edit</button>
                    <button onClick={() => onDelete(t._id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!trades.length && <p className="muted">No trades logged yet — add your first above.</p>}
      </div>
    </div>
  );
}
