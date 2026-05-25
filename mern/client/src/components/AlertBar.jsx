import { useEffect, useRef, useState } from "react";
import { getAlerts } from "../api.js";

const SEEN_KEY = "bandaru_seen_alerts";
const PROMPT_KEY = "bandaru_alert_prompt_off";
const CAT_LABEL = { fed: "FED", president: "PRESIDENT", market: "BREAKING" };

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-250))); }
  catch { /* ignore */ }
}
function relTime(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

// Global breaking-news alert strip — rendered under the header on every tab.
// Polls /api/alerts; when a headline it hasn't seen before appears, it shows a
// banner and (with permission) fires a desktop notification.
export default function AlertBar() {
  const [active, setActive] = useState([]);
  const [perm, setPerm] = useState(
    () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"),
  );
  const [promptOff, setPromptOff] = useState(() => localStorage.getItem(PROMPT_KEY) === "1");
  const seenRef = useRef(loadSeen());
  const firstRef = useRef(true);

  useEffect(() => {
    let on = true;
    const poll = () =>
      getAlerts()
        .then((d) => {
          if (!on) return;
          const alerts = d.alerts || [];
          if (firstRef.current) {
            // First load: surface only the last hour, never notify on stale news.
            firstRef.current = false;
            const recent = alerts.filter(
              (a) => a.published && Date.now() - Date.parse(a.published) < 3600000,
            );
            alerts.forEach((a) => seenRef.current.add(a.id));
            saveSeen(seenRef.current);
            if (recent.length) setActive(recent.slice(0, 4));
            return;
          }
          const fresh = alerts.filter((a) => !seenRef.current.has(a.id));
          if (!fresh.length) return;
          fresh.forEach((a) => seenRef.current.add(a.id));
          saveSeen(seenRef.current);
          setActive((prev) => [...fresh, ...prev].slice(0, 6));
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            fresh.forEach((a) => {
              try {
                // eslint-disable-next-line no-new
                new Notification(`${CAT_LABEL[a.category] || "ALERT"} — market alert`, {
                  body: a.title,
                });
              } catch { /* ignore */ }
            });
          }
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 60000);
    return () => { on = false; clearInterval(id); };
  }, []);

  const enable = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPerm(p)).catch(() => {});
  };
  const dismiss = (id) => setActive((prev) => prev.filter((a) => a.id !== id));
  const hidePrompt = () => { setPromptOff(true); localStorage.setItem(PROMPT_KEY, "1"); };

  const showPrompt = perm !== "granted" && perm !== "unsupported" && !promptOff;
  if (!active.length && !showPrompt) return null;

  return (
    <div className="alert-bar">
      {active.map((a) => (
        <div key={a.id} className={`alert-row alert-${a.category}`}>
          <span className="alert-badge">⚡ {CAT_LABEL[a.category] || "ALERT"}</span>
          <a href={a.url} target="_blank" rel="noreferrer" className="alert-text">{a.title}</a>
          <span className="alert-time">{relTime(a.published)}</span>
          <button className="alert-x" onClick={() => dismiss(a.id)} title="Dismiss">×</button>
        </div>
      ))}
      {showPrompt && (
        <div className="alert-enable">
          <span>🔔 Get desktop notifications for breaking Fed / President / market news</span>
          <button onClick={enable}>Enable</button>
          <button className="alert-x" onClick={hidePrompt} title="Not now">×</button>
        </div>
      )}
    </div>
  );
}
