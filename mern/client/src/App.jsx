import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import ChartAnalysis from "./components/ChartAnalysis.jsx";
import EntryExitAlerts from "./components/EntryExitAlerts.jsx";
import ProSignals from "./components/ProSignals.jsx";
import Watchlist from "./components/Watchlist.jsx";
import Screener from "./components/Screener.jsx";
import TradeJournal from "./components/TradeJournal.jsx";
import OptionsChain from "./components/OptionsChain.jsx";
import Profile from "./components/Profile.jsx";
import OptionDecay from "./components/OptionDecay.jsx";
import PreMarket from "./components/PreMarket.jsx";
import Backtest from "./components/Backtest.jsx";
import News from "./components/News.jsx";
import AlertBar from "./components/AlertBar.jsx";
import DataSourceBanner from "./components/DataSourceBanner.jsx";
import GexDashboard from "./components/GexDashboard.jsx";
import VexDashboard from "./components/VexDashboard.jsx";
import { getAnalysis, getVersion } from "./api.js";

const TABS = [
  { id: "chart",     label: "📊 Chart Analysis" },
  { id: "alerts",    label: "🚨 Entry / Exit Alerts" },
  { id: "pro",       label: "🎯 Pro Signals" },
  { id: "gex",       label: "🧲 GEX Dashboard" },
  { id: "vex",       label: "🌀 VEX Dashboard" },
  { id: "watchlist", label: "👀 Watchlist" },
  { id: "screener",  label: "🔍 Screener" },
  { id: "premarket", label: "🌅 Pre-Market" },
  { id: "news",      label: "📰 News" },
  { id: "profile",   label: "📈 Profile" },
  { id: "chain",     label: "⛓ Options Chain" },
  { id: "decay",     label: "📉 Option Decay" },
  { id: "backtest",  label: "🧪 Backtest" },
  { id: "journal",   label: "📒 Trade Journal" },
];

const ALLOWED_REFRESH = [5000, 10000, 30000];

export default function App() {
  const [ticker, setTicker] = useState(() => localStorage.getItem("bandaru_ticker") || "SPY");
  const [tab, setTab] = useState("chart");
  const [analysis, setAnalysis] = useState(null);
  const [version, setVersion] = useState("…");
  const [refreshMs, setRefreshMs] = useState(() => {
    const saved = parseInt(localStorage.getItem("bandaru_refresh_ms") || "10000", 10);
    return ALLOWED_REFRESH.includes(saved) ? saved : 10000;
  });

  useEffect(() => { getVersion().then((v) => setVersion(v.version)).catch(() => {}); }, []);
  useEffect(() => {
    let mounted = true;
    const load = () => getAnalysis(ticker).then((d) => mounted && setAnalysis(d)).catch(console.warn);
    load();
    const id = setInterval(load, refreshMs);
    return () => { mounted = false; clearInterval(id); };
  }, [ticker, refreshMs]);

  useEffect(() => { localStorage.setItem("bandaru_ticker", ticker); }, [ticker]);
  useEffect(() => { localStorage.setItem("bandaru_refresh_ms", String(refreshMs)); }, [refreshMs]);

  return (
    <div className="app">
      <Header ticker={ticker} setTicker={setTicker} analysis={analysis}
              refreshMs={refreshMs} setRefreshMs={setRefreshMs} />
      <DataSourceBanner />
      <AlertBar />
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
        {tab === "chart"     && <ChartAnalysis ticker={ticker} analysis={analysis} refreshMs={refreshMs} />}
        {tab === "alerts"    && <EntryExitAlerts analysis={analysis} />}
        {tab === "pro"       && <ProSignals analysis={analysis} />}
        {tab === "gex"       && <GexDashboard ticker={ticker} />}
        {tab === "vex"       && <VexDashboard ticker={ticker} />}
        {tab === "watchlist" && <Watchlist onPickTicker={setTicker} refreshMs={refreshMs} />}
        {tab === "screener"  && <Screener onPickTicker={setTicker} />}
        {tab === "premarket" && <PreMarket onPickTicker={setTicker} />}
        {tab === "news"      && <News />}
        {tab === "profile"   && <Profile ticker={ticker} />}
        {tab === "chain"     && <OptionsChain ticker={ticker} />}
        {tab === "decay"     && <OptionDecay ticker={ticker} />}
        {tab === "backtest"  && <Backtest ticker={ticker} />}
        {tab === "journal"   && <TradeJournal />}
      </main>
      <footer className="footer">
        <strong>Bandaru — Trade Research</strong>
        <span className="version">v{version}</span>
        · MERN stack · Open source (MIT) · Educational use only — not financial advice.
      </footer>
    </div>
  );
}
