import { useEffect, useState } from "react";
import { getVersion } from "../api.js";

// Delayed-data caution banner.
//
// Polls /api/version and, whenever the dashboard is serving ~15-min-delayed
// Yahoo data (either Yahoo is the configured source, or Schwab fell back /
// its token is dead), shows a persistent amber strip under the header.
// When real-time Schwab data is flowing it stays hidden.
//
// This guarantees the page is never silently "empty / unknown source": the
// user always knows which data they are looking at.
export default function DataSourceBanner() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let on = true;
    const poll = () =>
      getVersion()
        .then((v) => { if (on) setInfo(v); })
        .catch(() => { /* keep last known state */ });
    poll();
    // The data source changes rarely (only when Schwab connects / drops), so a
    // slow 60s poll is plenty and keeps /api/version traffic minimal.
    const id = setInterval(poll, 60000);
    return () => { on = false; clearInterval(id); };
  }, []);

  if (!info || info.delayed !== true) return null;

  const fellBack = info.configured_source === "schwab";
  const reason = info.last_fallback_reason;

  return (
    <div className="ds-banner" role="status">
      <span className="ds-banner-badge">⚠ DELAYED DATA</span>
      <span className="ds-banner-text">
        Quotes are about <strong>15 minutes delayed</strong> (Yahoo Finance).
        {fellBack
          ? " Real-time Schwab data is not connected — re-launch the app and"
            + " sign in to Schwab for live quotes."
          : " For real-time quotes, connect Schwab when you launch the app."}
        {fellBack && reason ? (
          <span className="ds-banner-reason"> (Schwab: {reason})</span>
        ) : null}
      </span>
    </div>
  );
}
