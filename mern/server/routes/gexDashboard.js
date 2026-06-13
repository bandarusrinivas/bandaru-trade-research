// /api/gex-dashboard?ticker=SPY — gamma-exposure trading dashboard.
//
// Builds the full GEX picture in one payload: net dealer gamma, the gamma
// flip / zero-gamma level, call & put walls, VWAP, the IV-implied expected
// move, plus RULE-BASED context heuristics (regime, dealer bias, a trade
// lean, scalp zones, alerts).
//
// HONESTY: the GEX numbers are modelled estimates using the standard naive
// convention (calls +, puts −, near-term chain). VWAP and the expected move
// are real computations. The signal / strength / scalp / alert boxes are
// simple deterministic rules for context — NOT a proprietary edge and NOT
// trade advice.

import { Router } from "express";
import * as data from "../services/data.js";
import { blackScholes } from "../services/blackscholes.js";

const router = Router();
const RISK_FREE = Number(process.env.RISK_FREE_RATE || 0.05);
const round = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function etNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function hoursToClose() {
  const et = etNow();
  const m = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30, close = 16 * 60;
  if (m <= open) return 6.5;
  if (m >= close) return 0.25;
  return (close - m) / 60;
}
const ivPct = (iv) => (iv == null || !isFinite(iv) ? null : iv > 1 ? iv : iv * 100);

// ET calendar date of a timestamp — used to group intraday bars into sessions.
function etDateStr(ts) {
  return new Date(ts).toLocaleDateString("en-US", { timeZone: "America/New_York" });
}
// True only during the regular cash session (Mon–Fri 9:30–16:00 ET).
function isMarketHours() {
  const et = etNow();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const m = et.getHours() * 60 + et.getMinutes();
  return m >= 9 * 60 + 30 && m < 16 * 60;
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const [quote, chain, intraday] = await Promise.all([
      data.getQuote(ticker).catch(() => null),
      data.getOptionChain(ticker).catch(() => null),
      // Pull 5 days of 5-minute bars so that, when the market is closed, the
      // dashboard can replay the most recent open session.
      data.getIntradayBars(ticker, "5m", "5d").catch(() => []),
    ]);
    const spot = quote?.price || chain?.underlying_price;
    if (!spot) return res.status(200).json({
      ticker, available: false,
      error: `No quote available for ${ticker}.`,
    });
    const contracts = chain?.contracts || [];

    // ── Session selection ──
    // Group the intraday bars into trading-day sessions and use the most
    // recent one. During market hours that is today; when the market is
    // closed it is automatically the previous open day — a replay/simulation
    // of the last live session instead of an empty intraday panel.
    const allBars = Array.isArray(intraday) ? intraday : [];
    let bars = [], sessionDate = null;
    if (allBars.length) {
      const byDay = new Map();
      for (const b of allBars) {
        const d = etDateStr(b.t);
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d).push(b);
      }
      const days = [...byDay.keys()];
      sessionDate = days[days.length - 1];
      bars = byDay.get(sessionDate) || [];
    }
    const todayEt = etDateStr(Date.now());
    const isLive = isMarketHours() && sessionDate === todayEt;
    const sessionMode = isLive ? "live" : "prior_session";
    // T spans the rest of today's session when live, else a full session.
    const sessionHours = isLive ? Math.max(hoursToClose(), 0.5) : 6.5;

    // ── VWAP from today's intraday bars ──
    let vwap = null;
    if (bars.length) {
      let pv = 0, vv = 0;
      for (const b of bars) { const tp = (b.h + b.l + b.c) / 3; const v = b.v || 0; pv += tp * v; vv += v; }
      vwap = vv > 0 ? pv / vv : bars[bars.length - 1].c;
    }

    // ── GEX per strike + ATM IV ──
    const Tfloor = sessionHours / (365 * 24);
    const perStrike = new Map();
    let atmIVc = null, atmIVp = null, dC = Infinity, dP = Infinity;
    for (const c of contracts) {
      const K = c.strike, oi = c.open_interest || 0;
      if (!K || oi <= 0) continue;
      const isCall = c.type === "call";
      const iv = ivPct(c.iv);
      const dist = Math.abs(K - spot);
      if (iv > 0) {
        if (isCall && dist < dC) { dC = dist; atmIVc = iv; }
        if (!isCall && dist < dP) { dP = dist; atmIVp = iv; }
      }
      let g = (typeof c.gamma === "number" && isFinite(c.gamma) && c.gamma > 0) ? c.gamma : null;
      if (g == null) {
        const sigma = iv > 0 ? iv / 100 : 0.2;
        g = blackScholes({ S: spot, K, T: Tfloor, r: RISK_FREE, sigma, type: isCall ? "call" : "put" }).gamma;
      }
      if (!isFinite(g) || g <= 0) continue;
      const gex = g * oi * 100 * spot * spot * 0.01 * (isCall ? 1 : -1);
      if (!perStrike.has(K)) perStrike.set(K, { strike: K, net: 0, callGex: 0, putGex: 0 });
      const e = perStrike.get(K);
      e.net += gex;
      if (isCall) e.callGex += gex; else e.putGex += gex;
    }
    const rows = [...perStrike.values()].sort((a, b) => a.strike - b.strike);
    const available = rows.length > 0;

    const totalGex = rows.reduce((s, r) => s + r.net, 0);

    // Zero-gamma flip — strike where cumulative net GEX crosses zero.
    let flip = null, cum = 0, prevCum = 0, prevK = rows[0]?.strike;
    for (const r of rows) {
      prevCum = cum; cum += r.net;
      if ((prevCum <= 0 && cum > 0) || (prevCum >= 0 && cum < 0)) {
        const span = cum - prevCum;
        flip = prevK + (span !== 0 ? -prevCum / span : 0) * (r.strike - prevK);
        break;
      }
      prevK = r.strike;
    }
    if (flip == null) flip = vwap || spot;

    // Gamma mid — |GEX|-weighted average strike (the gamma centre of mass).
    let wSum = 0, wK = 0;
    for (const r of rows) { const w = Math.abs(r.net); wSum += w; wK += w * r.strike; }
    const gammaMid = wSum > 0 ? wK / wSum : flip;

    // Call walls (largest positive net GEX above spot), put walls (below).
    const callWalls = rows.filter((r) => r.strike > spot && r.net > 0)
      .sort((a, b) => b.net - a.net).slice(0, 2).sort((a, b) => a.strike - b.strike);
    const putWalls = rows.filter((r) => r.strike < spot && r.net < 0)
      .sort((a, b) => a.net - b.net).slice(0, 2).sort((a, b) => b.strike - a.strike);

    // ── Expected move (1 SD, IV-implied, rest of session) ──
    const atmIV = [atmIVc, atmIVp].filter((v) => v > 0);
    const ivAvg = atmIV.length ? atmIV.reduce((a, b) => a + b, 0) / atmIV.length : 18;
    const Tem = sessionHours / (365 * 24);
    const emDollars = spot * (ivAvg / 100) * Math.sqrt(Tem);
    const emPct = (emDollars / spot) * 100;

    // ── Vol regime — recent intraday range vs earlier ──
    let volRegime = "NEUTRAL";
    if (bars.length >= 12) {
      const rng = (arr) => arr.reduce((s, b) => s + (b.h - b.l), 0) / arr.length;
      const recent = rng(bars.slice(-6));
      const prior = rng(bars.slice(-12, -6));
      if (prior > 0) {
        if (recent > prior * 1.2) volRegime = "EXPANSION";
        else if (recent < prior * 0.8) volRegime = "CONTRACTION";
      }
    }

    // ── Delta pressure — last bars' direction vs VWAP ──
    let deltaPressure = "NEUTRAL";
    if (bars.length >= 3 && vwap != null) {
      const last3 = bars.slice(-3);
      const up = last3.filter((b) => b.c >= b.o).length;
      if (up >= 2 && spot >= vwap) deltaPressure = "BUYING";
      else if (up <= 1 && spot < vwap) deltaPressure = "SELLING";
    }

    // ── Regime labels ──
    const gexM = totalGex / 1e6;
    const regime = totalGex >= 0 ? "positive" : "negative";
    const regimeLabel = gexM >= 150 ? "HIGH POSITIVE"
                      : gexM > 0 ? "POSITIVE"
                      : gexM <= -150 ? "HIGH NEGATIVE" : "NEGATIVE";
    const aboveFlip = spot >= flip;
    const marketCondition = totalGex >= 0 ? "SUPPORTIVE" : "UNSTABLE";
    const dealerBias = totalGex >= 0 ? "LONG DELTA HEDGE" : "SHORT GAMMA CHASE";

    // Magnet — nearest strong level to spot.
    const magnetCands = [
      { label: "VWAP", price: vwap },
      { label: "GAMMA MID", price: gammaMid },
      { label: "GEX FLIP", price: flip },
    ].filter((c) => c.price != null);
    const magnet = magnetCands.sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot))[0]
      || { label: "VWAP", price: vwap };

    const cw1 = callWalls[0]?.strike ?? null;
    const cw2 = callWalls[1]?.strike ?? null;
    const pw1 = putWalls[0]?.strike ?? null;
    const pw2 = putWalls[1]?.strike ?? null;

    // ── Rule-based trade lean ──
    let action, altAction, strength;
    if (totalGex >= 0 && aboveFlip) {
      action = "BUY CALLS"; altAction = "SELL PUTS";
      strength = 60 + (deltaPressure === "BUYING" ? 18 : 0) + (regimeLabel === "HIGH POSITIVE" ? 12 : 4);
    } else if (totalGex >= 0 && !aboveFlip) {
      action = "FADE / MEAN-REVERT"; altAction = "SELL CALLS";
      strength = 50 + (deltaPressure === "SELLING" ? 12 : 0);
    } else {
      action = "REDUCE SIZE — SCALP ONLY"; altAction = "WAIT FOR FLIP RECLAIM";
      strength = 40 + (volRegime === "EXPANSION" ? 10 : 0);
    }
    strength = Math.max(5, Math.min(98, Math.round(strength)));

    // ── Alerts ──
    let squeezeAlert = "NONE", trapAlert = "NONE";
    if (totalGex < 0 && cw1 && Math.abs(spot - cw1) / spot < 0.004) {
      squeezeAlert = `Near ${cw1} call wall in negative gamma`;
    }
    if (vwap != null && Math.abs(spot - vwap) / spot < 0.0015 && volRegime === "CONTRACTION") {
      trapAlert = "Coiled at VWAP — wait for direction";
    }

    res.json({
      ticker,
      available,
      spot: round(spot),
      time: etNow().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      is_live: isLive,
      session_mode: sessionMode,
      session_date: sessionDate,
      net_gex: Math.round(totalGex),
      net_gex_m: round(gexM, 2),
      regime,
      regime_label: regimeLabel,
      flip_level: round(flip),
      gamma_mid: round(gammaMid),
      vwap: round(vwap),
      expected_move: { dollars: round(emDollars), pct: round(emPct, 2),
                       upper: round(spot + emDollars), lower: round(spot - emDollars) },
      vol_regime: volRegime,
      delta_pressure: deltaPressure,
      market_condition: marketCondition,
      dealer_bias: dealerBias,
      above_flip: aboveFlip ? "BULLISH" : "BEARISH",
      magnet: magnet.label,
      iv_atm: round(ivAvg, 1),
      call_walls: callWalls.map((w, i) => ({ strike: round(w.strike), label: i === 0 ? "CALL WALL 1" : "CALL WALL 2 (STRONG)" })),
      put_walls: putWalls.map((w, i) => ({ strike: round(w.strike), label: i === 0 ? "PUT WALL 1" : "PUT WALL 2 (STRONG)" })),
      next_key_level: cw1 ? { price: round(cw1), label: "CALL WALL 1" } : null,
      key_support: { price: round(gammaMid), label: "GAMMA MID" },
      next_key_support: pw1 ? { price: round(pw1), label: "PUT WALL 1" } : null,
      signal: { action, strength },
      alternate: { action: altAction, strength: Math.max(5, strength - 6) },
      scalp_long: { zone: [round(spot), round(cw1 || spot * 1.004)],
                    t1: round(cw1 || spot * 1.004), t2: round(cw2 || cw1 || spot * 1.008) },
      scalp_short: { zone: [round(pw1 || spot * 0.996), round(spot)],
                     t1: round(gammaMid), t2: round(pw2 || pw1 || spot * 0.992) },
      invalidation: `Close below ${round(gammaMid)} (Gamma Mid)`,
      risk_note: totalGex >= 0
        ? "Positive gamma — fade extremes, expect pinning. Small size."
        : "Negative gamma — trending & volatile. Wider stops, small size.",
      squeeze_alert: squeezeAlert,
      trap_alert: trapAlert,
      note: "GEX is a modelled estimate (naive convention, near-term chain). VWAP "
          + "and expected move are computed live. The signal, strength, scalp and "
          + "alert boxes are deterministic rules for context — educational, not "
          + "trade advice.",
    });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

export default router;
