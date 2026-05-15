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
  // Probe Schwab sidecar so the UI can show if it's reachable
  let sidecar = null;
  if (ds.configured_source === "schwab") {
    sidecar = await schwab.ping();
  }
  res.json({
    version: await readVersion(),
    product: "Bandaru Trade Research",
    stack: "MERN",
    ...ds,
    sidecar,
  });
});

export default router;
