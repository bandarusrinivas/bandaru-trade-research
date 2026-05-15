import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

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
  res.json({
    version: await readVersion(),
    product: "Bandaru Trade Research",
    data_source: process.env.DATA_SOURCE || "yahoo",
    stack: "MERN",
  });
});

export default router;
