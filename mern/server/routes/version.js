import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { status as dataStatus, schwab } from "../services/data.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Look for VERSION in this order: env override, /app/VERSION (Docker), repo root (../../../VERSION)
const VERSION_PATHS = [
  process.env.VERSION_FILE,
  "/app/VERSION",
  path.resolve(__dirname, "../../../VERSION"),
  path.resolve(__dirname, "../../VERSION"),
].filter(Boolean);

async function readVersion() {
  for (const p of VERSION_PATHS) {
    try {
      const v = (await fs.readFile(p, "utf8")).trim();
      if (v) return v;
    } catch { /* try next */ }
  }
  return "2.0.0";
}

router.get("/", async (_req, res) => {
  const ds = dataStatus();

  // Probe the Schwab sidecar so the UI can show whether it's reachable.
  let sidecar = null;
  if (ds.configured_source === "schwab") {
    sidecar = await schwab.ping();
  }

  // `delayed` drives the UI's 15-min-delay caution banner. It's true when
  // we're serving Yahoo data — either because Yahoo is the configured
  // source, or because Schwab fell back / its breaker is open / the
  // sidecar isn't reachable.
  const delayed =
    ds.delayed === true ||
    (ds.configured_source === "schwab" && sidecar && sidecar.ok === false);

  const data_label = delayed ? "Delayed — Yahoo Finance" : "Real-time — Schwab";
  const data_note = delayed
    ? "Quotes are about 15 minutes delayed (Yahoo Finance). For real-time "
      + "data, connect Schwab when you launch the app."
    : "Real-time quotes from Charles Schwab.";

  res.json({
    version: await readVersion(),
    product: "Bandaru Trade Research",
    stack: "MERN",
    ...ds,
    delayed,
    data_label,
    data_note,
    sidecar,
  });
});

export default router;
