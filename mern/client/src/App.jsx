import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import ChartAnalysis from "./components/ChartAnalysis.jsx";
import EntryExitAlerts from "./components/EntryExitAlerts.jsx";
import ProSignals from "./components/ProSignals.jsx";
import Watchlist from "./components/Watchlist.jsx";
import Screener from "./components/Screener.jsx";
import TradeJournal from "./components/TradeJournal.jsx";
import OptionsChain from "./components/OptionsChain.jsx";
import { getAnalysis, getVersion } from "./api.js";

const TABS = [
  { id: "chart",     label: "📊 Chart Analysis" },
  { id: "alerts",    label: "🚨 Entry / Exit Alerts" },
  { id: "pro",       label: "🎯 Pro Signals" },
  { id: "watchlist", label: "👀 Watchlist" },
  { id: "screener",  label: "🔍 Screener" },
  { id: "journal",   label: "📒 Trade Journal" },
  { id: "chain",     label: "⛓ Options Chain" },
];

export default function App() {
  const [ticker, setTicker] = useState(() => localStorage.getItem("bandaru_ticker") || "SPY");
  const [tab, setTab] = useState("chart");
  const [analysis, setAnalysis] = useState(null);
  const [version, setVersion] = useState("…");

  useEffect(() => { getVersion().then((v) => setVersion(v.version)).catch(() => {}); }, []);
  useEffect(() => {
    let mounted = true;
    const load = () => getAnalysis(ticker).then((d) => mounted && setAnalysis(d)).catch(console.warn);
    load();
    const id = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(id); };
  }, [ticker]);

  useEffect(() => { localStorage.setItem("bandaru_ticker", ticker); }, [ticker]);

  return (
    <div className="app">
      <Header ticker={ticker} setTicker={setTicker} analysis={analysis} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {tab === "chart"     && <ChartAnalysis ticker={ticker} analysis={analysis} />}
        {tab === "alerts"    && <EntryExitAlerts analysis={analysis} />}
        {tab === "pro"       && <ProSignals analysis={analysis} />}
        {tab === "watchlist" && <Watchlist onPickTicker={setTicker} />}
        {tab === "screener"  && <Screener onPickTicker={setTicker} />}
        {tab === "journal"   && <TradeJournal />}
        {tab === "chain"     && <OptionsChain ticker={ticker} />}
      </main>
      <footer className="footer">
        <strong>Bandaru — Trade Research</strong>
        <span className="version">v{version}</span>
        · MERN stack · Open source (MIT) · Educational use only — not financial advice.
      </footer>
    </div>
  );
}
