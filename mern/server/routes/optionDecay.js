// /api/option-decay?ticker=SPY&strike=580&type=call&dte=0&iv=0.15
//
// Models how an option's premium evolves with stock price and time decay.
// Returns a price × time grid suitable for plotting multiple decay curves,
// plus a pure theta curve (premium at current spot as the clock runs down).

import { Router } from "express";
import * as data from "../services/data.js";
import { blackScholes, impliedVolatility, yearsFromHours } from "../services/blackscholes.js";

const router = Router();

const RISK_FREE = Number(process.env.RISK_FREE_RATE || 0.05);

// Hours of trading life left in a US session, given "now"
function tradingHoursLeftToday() {
  const now = new Date();
  // Convert to ET (approx — server may be UTC; this is good enough for modeling)
  const etOffsetMin = -5 * 60; // EST; DST handled loosely
  const et = new Date(now.getTime() + (etOffsetMin - now.getTimezoneOffset()) * 60000);
  const closeMin = 16 * 60;          // 4:00 PM ET
  const openMin = 9 * 60 + 30;       // 9:30 AM ET
  const nowMin = et.getHours() * 60 + et.getMinutes();
  if (nowMin <= openMin) return 6.5;
  if (nowMin >= closeMin) return 0;
  return (closeMin - nowMin) / 60;
}

const r2 = (v) => Math.round(v * 100) / 100;

// "Now" as an approximate US/Eastern Date
function etNowDate() {
  const d = new Date();
  return new Date(d.getTime() + ((-5 * 60) - d.getTimezoneOffset()) * 60000);
}

// Build the clock-time points the simulator plots, from "Now" to expiration.
//  - 0DTE  → Now, each upcoming whole hour (10 AM…3 PM), Exp
//  - >0DTE → Now, three evenly spaced steps, Exp
function buildSimTimePoints(dte, totalHoursLeft) {
  const pts = [{ label: "Now", hours_left: r2(totalHoursLeft), kind: "now" }];
  if (dte === 0) {
    const startHr = etNowDate().getHours() + 1;          // next whole clock hour
    for (let h = Math.max(startHr, 10); h <= 15; h++) {
      const hoursToClose = 16 - h;                        // h:00 → 4:00 PM expiration
      if (hoursToClose >= totalHoursLeft - 0.05) continue; // not actually after "now"
      if (hoursToClose <= 0.05) continue;
      const label = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
      pts.push({ label, hours_left: hoursToClose, kind: "mid" });
    }
  } else {
    const N = 4;
    for (let i = 1; i < N; i++) {
      const hrs = (totalHoursLeft * (N - i)) / N;
      const daysLeft = hrs / 6.5;
      pts.push({
        label: daysLeft >= 1 ? `${daysLeft.toFixed(1)}d` : `${hrs.toFixed(1)}h`,
        hours_left: r2(hrs),
        kind: "mid",
      });
    }
  }
  pts.push({ label: "Exp", hours_left: 0, kind: "exp" });
  return pts;
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  const type = (req.query.type || "call").toString().toLowerCase() === "put" ? "put" : "call";
  const dte = Math.max(0, parseInt(req.query.dte || "0", 10));   // days to expiration

  try {
    // Spot price
    const quote = await data.getQuote(ticker);
    const spot = quote?.price;
    if (!spot) return res.status(200).json({
      ticker, available: false,
      error: `No quote available for ${ticker}.`,
    });

    // Strike — default to nearest 1-dollar ATM
    let strike = parseFloat(req.query.strike);
    if (!isFinite(strike)) strike = Math.round(spot);

    // Implied volatility — from query, else pull from the live chain, else default
    let iv = parseFloat(req.query.iv);
    if (!isFinite(iv) || iv <= 0) {
      try {
        const chain = await data.getOptionChain(ticker);
        const match = (chain.contracts || [])
          .filter((c) => c.type === type)
          .sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike))[0];
        if (match?.iv) iv = match.iv > 1 ? match.iv / 100 : match.iv;  // chain stores IV as %
      } catch { /* fall through */ }
    }
    if (!isFinite(iv) || iv <= 0) iv = 0.20; // sane default

    // ----- Time setup -----
    const hoursLeftToday = tradingHoursLeftToday();
    // Total hours to expiration = remaining today + full days * 6.5 trading hours
    const totalHoursLeft = hoursLeftToday + dte * 6.5;

    // Time snapshots to plot as separate curves
    let snapshots;
    if (dte === 0) {
      // 0DTE — show the intraday decay
      snapshots = [
        { label: `Now (${hoursLeftToday.toFixed(1)}h left)`, hours: totalHoursLeft },
        { label: "Midday",        hours: Math.min(totalHoursLeft, 3.25) },
        { label: "Power hour",    hours: Math.min(totalHoursLeft, 1) },
        { label: "Expiration",    hours: 0 },
      ];
    } else {
      snapshots = [
        { label: `Now (${dte}DTE)`,  hours: totalHoursLeft },
        { label: "End of today",     hours: dte * 6.5 },
        { label: "Halfway",          hours: (dte * 6.5) / 2 },
        { label: "Expiration",       hours: 0 },
      ];
    }
    // De-dupe / keep distinct
    snapshots = snapshots.filter((s, i, arr) =>
      arr.findIndex((x) => Math.abs(x.hours - s.hours) < 0.01) === i);

    // ----- Stock price range: ±5% of spot, 41 steps -----
    const lo = spot * 0.95, hi = spot * 1.05;
    const STEPS = 41;
    const priceRange = [];
    for (let i = 0; i < STEPS; i++) {
      priceRange.push(Math.round((lo + ((hi - lo) * i) / (STEPS - 1)) * 100) / 100);
    }

    // ----- Build premium grid: one curve per snapshot -----
    const curves = snapshots.map((snap) => {
      const T = yearsFromHours(snap.hours);
      const premiums = priceRange.map((S) =>
        Math.round(blackScholes({ S, K: strike, T, r: RISK_FREE, sigma: iv, type }).price * 100) / 100
      );
      return { label: snap.label, hours_left: Math.round(snap.hours * 100) / 100, premiums };
    });

    // ----- Current greeks at spot -----
    const greeks = blackScholes({
      S: spot, K: strike, T: yearsFromHours(totalHoursLeft), r: RISK_FREE, sigma: iv, type,
    });

    // ----- Theta curve: premium at current spot as hours tick down -----
    const thetaCurve = [];
    const thetaSteps = 14;
    for (let i = 0; i <= thetaSteps; i++) {
      const h = totalHoursLeft * (1 - i / thetaSteps);
      const bs = blackScholes({ S: spot, K: strike, T: yearsFromHours(h), r: RISK_FREE, sigma: iv, type });
      thetaCurve.push({
        hours_left: Math.round(h * 100) / 100,
        premium: Math.round(bs.price * 100) / 100,
      });
    }

    // ----- Surface: premium across stock-price (rows) × time-of-day (cols) ---
    // Time axis spans the trading day 8:30 AM → 4:00 PM in 30-minute steps.
    // Expiration is modeled at 4:00 PM ET on the expiration day (today + dte).
    const START_MIN = 8.5 * 60;    // 08:30
    const END_MIN   = 16 * 60;     // 16:00
    const STEP_MIN  = 30;
    const EXPIRY_MIN = 16 * 60;    // 16:00 expiration

    const timeAxis = [];      // "08:30", "09:00", …
    const timeHoursLeft = []; // hours to expiration at each column
    for (let m = START_MIN; m <= END_MIN; m += STEP_MIN) {
      const hh = Math.floor(m / 60), mm = m % 60;
      timeAxis.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      // hours from this clock time to the 4:00 PM expiration, + full days for dte
      const hrs = Math.max(0, (EXPIRY_MIN - m) / 60 + dte * 24);
      timeHoursLeft.push(Math.round(hrs * 100) / 100);
    }

    // Price rows — highest price first (row 0 = top of the heatmap)
    const PRICE_ROWS = 21;
    const priceAxis = [];
    for (let i = 0; i < PRICE_ROWS; i++) {
      const frac = i / (PRICE_ROWS - 1);
      priceAxis.push(Math.round((hi - frac * (hi - lo)) * 100) / 100);
    }

    // surface[rowIdx][colIdx] = premium at priceAxis[rowIdx], timeAxis[colIdx]
    const surface = priceAxis.map((S) =>
      timeHoursLeft.map((h) =>
        Math.round(blackScholes({ S, K: strike, T: yearsFromHours(h), r: RISK_FREE, sigma: iv, type }).price * 100) / 100
      )
    );

    // "Now" column index — closest time column to the current clock time
    const nowMin = (() => {
      const d = new Date();
      const et = new Date(d.getTime() + ((-5 * 60) - d.getTimezoneOffset()) * 60000);
      return et.getHours() * 60 + et.getMinutes();
    })();
    let nowColIdx = Math.round((nowMin - START_MIN) / STEP_MIN);
    nowColIdx = Math.max(0, Math.min(timeAxis.length - 1, nowColIdx));

    // Spot row index — closest price row to current spot
    let spotRowIdx = 0, bestDiff = Infinity;
    priceAxis.forEach((pr, i) => {
      const d = Math.abs(pr - spot);
      if (d < bestDiff) { bestDiff = d; spotRowIdx = i; }
    });

    // ───────── Simulator grid — fine underlying price × clock time ─────────
    // Powers the "Simulated Returns" view. The client scrubs an underlying
    // price on a slider and reads premium-vs-time straight out of this grid
    // (with linear interpolation between rows) — no extra round-trips.
    const simTimePoints = buildSimTimePoints(dte, totalHoursLeft);
    const simPad = dte === 0 ? 0.06 : 0.12;          // ± range around spot
    const simLo = spot * (1 - simPad);
    const simHi = spot * (1 + simPad);
    const SIM_STEPS = 181;
    const simPriceAxis = [];
    for (let i = 0; i < SIM_STEPS; i++) {
      simPriceAxis.push(r2(simLo + ((simHi - simLo) * i) / (SIM_STEPS - 1)));
    }
    let simSpotIdx = 0, simBest = Infinity;
    simPriceAxis.forEach((p, i) => {
      const d = Math.abs(p - spot);
      if (d < simBest) { simBest = d; simSpotIdx = i; }
    });
    const simGrid = simPriceAxis.map((S) =>
      simTimePoints.map((tp) =>
        r2(blackScholes({
          S, K: strike, T: yearsFromHours(tp.hours_left),
          r: RISK_FREE, sigma: iv, type,
        }).price)
      )
    );

    res.json({
      ticker,
      spot: Math.round(spot * 100) / 100,
      strike,
      type,
      dte,
      iv: Math.round(iv * 10000) / 100,        // back to % for display
      risk_free_rate: RISK_FREE,
      hours_left_today: Math.round(hoursLeftToday * 100) / 100,
      total_hours_left: Math.round(totalHoursLeft * 100) / 100,
      current_premium: Math.round(greeks.price * 100) / 100,
      greeks: {
        delta: Math.round(greeks.delta * 1000) / 1000,
        gamma: Math.round(greeks.gamma * 1000) / 1000,
        theta: Math.round(greeks.theta * 1000) / 1000,   // per day
        vega:  Math.round(greeks.vega * 1000) / 1000,
        intrinsic: Math.round(greeks.intrinsic * 100) / 100,
        extrinsic: Math.round(greeks.extrinsic * 100) / 100,
      },
      price_range: priceRange,
      curves,
      theta_curve: thetaCurve,

      // Multi-dimensional surface: stock price × time-of-day → premium
      surface: {
        time_axis: timeAxis,             // ["08:30", … "16:30"]
        time_hours_left: timeHoursLeft,  // hours to expiry at each column
        price_axis: priceAxis,           // descending stock prices (rows)
        grid: surface,                   // grid[row][col] = premium
        now_col: nowColIdx,              // current time column
        spot_row: spotRowIdx,            // current spot row
        expiration_time: "16:00",
      },

      // Simulated Returns: fine underlying-price (rows) × clock time (cols).
      // grid[priceIdx][timeIdx] = modeled premium per share.
      simulator: {
        price_axis: simPriceAxis,        // ascending underlying prices
        spot_index: simSpotIdx,          // row closest to current spot
        time_points: simTimePoints,      // [{label, hours_left, kind}] Now → Exp
        grid: simGrid,
        entry_premium: r2(greeks.price), // premium at spot, now (default cost basis)
      },
    });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

export default router;
