import { useEffect, useState } from "react";
import { getNews } from "../api.js";

function relTime(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

function SourceBadge({ source }) {
  const cls = source === "Google News" ? "news-src-google"
            : source === "Finnhub" ? "news-src-finnhub"
            : source === "MarketWatch" ? "news-src-marketwatch"
            : "news-src-yahoo";
  return <span className={`news-src ${cls}`}>{source}</span>;
}

// One headline card — used by the Breaking and Stock Market Feed sections.
function HeadlineCard({ n }) {
  return (
    <a className="news-break-card" href={n.url} target="_blank" rel="noreferrer">
      <div className="news-break-title">{n.title}</div>
      <div className="news-break-meta">
        <SourceBadge source={n.source} />
        <span className="news-pub">{n.publisher}</span>
        <span className="news-time">{relTime(n.published)}</span>
        {n.tickers?.length ? (
          <span className="news-tickers">
            {n.tickers.map((t) => <span key={t} className="news-tick">{t}</span>)}
          </span>
        ) : null}
      </div>
    </a>
  );
}

// International stock-index quote tile — last value + daily change.
function IndexCard({ idx }) {
  const has = idx.last != null;
  const up = (idx.change_pct ?? 0) >= 0;
  const num = (v, d = 2) =>
    v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d });
  return (
    <div className={`wi-card ${has ? (up ? "up" : "down") : "wi-na"}`}>
      <div className="wi-top">
        <span className="wi-name">{idx.name}</span>
        <span className="wi-region">{idx.region}</span>
      </div>
      <div className="wi-last">{has ? num(idx.last) : "—"}</div>
      <div className={`wi-chg ${up ? "up" : "down"}`}>
        {has && idx.change_pct != null
          ? `${up ? "▲" : "▼"} ${up ? "+" : ""}${idx.change_pct.toFixed(2)}%`
          : "—"}
        {has && idx.change != null ? (
          <span className="wi-chg-abs"> ({idx.change >= 0 ? "+" : ""}{num(idx.change)})</span>
        ) : null}
      </div>
    </div>
  );
}

export default function News() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    getNews()
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="news-page">
      <div className="card">
        <div className="profile-card-head">
          <h2>📰 Market News</h2>
          <span className="muted small">
            {data ? `updated ${relTime(data.generated_at)}${data.cached ? " · cached" : ""}` : ""}
          </span>
        </div>

        <div className="news-controls">
          <button className="bt-run" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && <p className="err">News error: {error}</p>}
        {loading && !data && (
          <p className="muted">Gathering headlines from Finnhub, Google News, Yahoo and MarketWatch…</p>
        )}

        {data && (
          <>
            {/* ── 1. Breaking News ── */}
            <h4 className="news-section">⚡ Breaking News</h4>
            {data.breaking?.length ? (
              <div className="news-breaking">
                {data.breaking.map((n, i) => <HeadlineCard key={i} n={n} />)}
              </div>
            ) : <p className="muted">No breaking headlines right now.</p>}

            {/* ── 2. Stock Market Feed ── */}
            <h4 className="news-section">📊 Stock Market Feed</h4>
            <p className="muted small news-feed-sub">
              Merged from Finnhub, Google News, Yahoo Finance and MarketWatch.
              {data.stock_sources ? (
                <span className="news-feed-counts">
                  {" "}Finnhub {data.stock_sources.finnhub} ·
                  MarketWatch {data.stock_sources.marketwatch} ·
                  Google {data.stock_sources.google} ·
                  Yahoo {data.stock_sources.yahoo}
                </span>
              ) : null}
            </p>
            {data.finnhub_enabled === false && (
              <p className="muted small news-finnhub-hint">
                💡 Add a free <code>FINNHUB_API_KEY</code> to your <code>.env</code> file
                (get one at finnhub.io/register) to include Finnhub headlines in this feed.
              </p>
            )}
            {data.stock_feed?.length ? (
              <div className="news-breaking news-stockfeed">
                {data.stock_feed.map((n, i) => <HeadlineCard key={i} n={n} />)}
              </div>
            ) : <p className="muted">No stock headlines right now.</p>}

            {/* ── 3. International Stock Indexes ── */}
            <h4 className="news-section">🌐 International Stock Indexes</h4>
            <p className="muted small news-feed-sub">
              Major world index levels and the day's move — live (~15-min delayed) from Yahoo Finance.
            </p>
            {data.world_indexes?.length ? (
              <div className="wi-grid">
                {data.world_indexes.map((idx) => <IndexCard key={idx.symbol} idx={idx} />)}
              </div>
            ) : <p className="muted">International index quotes are unavailable right now.</p>}

            {/* ── 4. International News ── */}
            <h4 className="news-section">🌎 International News</h4>
            <p className="muted small news-feed-sub">
              Global and regional market headlines — Europe, Asia-Pacific and world markets.
            </p>
            {data.intl_news?.length ? (
              <div className="news-breaking">
                {data.intl_news.map((n, i) => <HeadlineCard key={i} n={n} />)}
              </div>
            ) : <p className="muted">No international headlines right now.</p>}

            <p className="muted small">{data.note}</p>
          </>
        )}
      </div>
    </div>
  );
}
