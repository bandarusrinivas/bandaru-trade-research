// Bandaru Trade Research — Express entry point.
// Wires routes, MongoDB, CORS, request logging.

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import "dotenv/config";

import versionRoute from "./routes/version.js";
import analysisRoute from "./routes/analysis.js";
import candlesRoute from "./routes/candles.js";
import chainRoute from "./routes/chain.js";
import watchlistRoute from "./routes/watchlist.js";
import screenerRoute from "./routes/screener.js";
import tradesRoute from "./routes/trades.js";
import diagnoseRoute from "./routes/diagnose.js";
import profileRoute from "./routes/profile.js";
import optionDecayRoute from "./routes/optionDecay.js";
import gammaRoute from "./routes/gamma.js";
import pivotStopsRoute from "./routes/pivotStops.js";
import oiFlowRoute from "./routes/oiFlow.js";
import backtestRoute from "./routes/backtest.js";
import premarketRoute from "./routes/premarket.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ----- Middleware -----
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ----- Routes -----
app.use("/api/version", versionRoute);
app.use("/api/analysis", analysisRoute);
app.use("/api/candles", candlesRoute);
app.use("/api/chain", chainRoute);
app.use("/api/watchlist", watchlistRoute);
app.use("/api/screener", screenerRoute);
app.use("/api/trades", tradesRoute);    // MongoDB-backed trade journal
app.use("/api/diagnose", diagnoseRoute); // probes each adapter, reports pass/fail
app.use("/api/profile", profileRoute);   // full stock profile + 200-word summary
app.use("/api/option-decay", optionDecayRoute); // Black-Scholes premium decay grid
app.use("/api/gamma", gammaRoute);        // dealer gamma-exposure (GEX) estimate
app.use("/api/pivot-stops", pivotStopsRoute); // pivot stop ladder + level validation
app.use("/api/oi-flow", oiFlowRoute);     // day-over-day open-interest change
app.use("/api/backtest", backtestRoute);  // technical-signal strategy backtester
app.use("/api/premarket", premarketRoute); // unusual-volume scanner

// Health check (also used by docker-compose healthcheck)
app.get("/", (_req, res) => res.json({ name: "Bandaru Trade Research", status: "ok" }));

// ----- Boot -----
async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/bandaru";
  try {
    await mongoose.connect(mongoUri);
    console.log(`✓ MongoDB connected at ${mongoUri}`);
  } catch (err) {
    console.error(`⚠ MongoDB unreachable (${err.message}). Trade Journal disabled.`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✓ Bandaru server listening on http://0.0.0.0:${PORT}`);
    console.log(`  Data source: ${process.env.DATA_SOURCE || "yahoo"}`);
  });
}

main();
