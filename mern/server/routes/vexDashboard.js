// /api/vex-dashboard?ticker=SPY — vanna-exposure trading dashboard.
//
// Parallel to /api/gex-dashboard, but built around **dealer Vanna Exposure**
// (VEX) — the rate of change of dealer delta with respect to implied
// volatility. Where GEX answers "how does dealer hedging respond to SPOT
// moves?", VEX answers "how does dealer hedging respond to IV moves?".
//
// HONESTY: VEX numbers use the standard naive convention (calls +, puts −,
// near-term chain) with Black-Scholes vanna per share, expressed in dollars
// of dealer delta-hedge per 1-vol-point (1% IV) move. The signal / strength
// / scalp / alert boxes are deterministic rules for context — educational,
// not trade advice.

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

function etDateStr(ts) {
  return new Date(ts).toLocaleDateString("en-US", { timeZone: "America/New_York" });
}
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
      data.getIntradayBars(ticker, "5m", "5d").catch(() => []),
    ]);
    const spot = quote?.price || chain?.underlying_price;
    if (!spot) return res.status(200).json({
      ticker, available: false,
      error: `No quote available for ${ticker}.`,
    });
    const contracts = chain?.contracts || [];

    // ── Session selection — prior-session replay when closed (same as GEX) ──
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
    const sessionHours = isLive ? Math.max(hoursToClose(), 0.5) : 6.5;

    // ── VWAP ──
    let vwap = null;
    if (bars.length) {
      let pv = 0, vv = 0;
      for (const b of bars) { const tp = (b.h + b.l + b.c) / 3; const v = b.v || 0; pv += tp * v; vv += v; }
      vwap = vv > 0 ? pv / vv : bars[bars.length - 1].c;
    }

    // ── VEX per strike + ATM IV ──
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
      const sigma = iv > 0 ? iv / 100 : 0.2;
      const bs = blackScholes({ S: spot, K, T: Tfloor, r: RISK_FREE, sigma, type: isCall ? "call" : "put" });
      const vanna = bs.vanna;          // per 1-vol-point per share
      if (!isFinite(vanna) || vanna === 0) continue;
      // VEX in $ dealer-delta change per 1% IV move (naive: calls +, puts -).
      const vex = vanna * oi * 100 * spot * (isCall ? 1 : -1);
      if (!perStrike.has(K)) perStrike.set(K, { strike: K, net: 0, callVex: 0, putVex: 0 });
      const e = perStrike.get(K);
      e.net += vex;
      if (isCall) e.callVex += vex; else e.putVex += vex;
    }
    const rows = [...perStrike.values()].sort((a, b) => a.strike - b.strike);
    const available = rows.length > 0;

    const totalVex = rows.reduce((s, r) => s + r.net, 0);

    // Zero-vanna flip — strike where cumulative net VEX crosses zero.
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

    // Vanna mid — |VEX|-weighted average strike (the vanna centre of mass).
    let wSum = 0, wK = 0;
    for (const r of rows) { const w = Math.abs(r.net); wSum += w; wK += w * r.strike; }
    const vannaMid = wSum > 0 ? wK / wSum : flip;

    // Call vanna walls (largest positive net VEX above spot), put vanna walls (below).
    const callWalls = rows.filter((r) => r.strike > spot && r.net > 0)
      .sort((a, b) => b.net - a.net).slice(0, 2).sort((a, b) => a.strike - b.strike);
    const putWalls = rows.filter((r) => r.strike < spot && r.net < 0)
      .sort((a, b) => a.net - b.net).slice(0, 2).sort((a, b) => b.strike - a.strike);

    // ── Expected move (1 SD, IV-implied) ──
    const atmIV = [atmIVc, atmIVp].filter((v) => v > 0);
    const ivAvg = atmIV.length ? atmIV.reduce((a, b) => a + b, 0) / atmIV.length : 18;
    const Tem = sessionHours / (365 * 24);
    const emDollars = spot * (ivAvg / 100) * Math.sqrt(Tem);
    const emPct = (emDollars / spot) * 100;

    // ── Vol regime + delta pressure (same intraday rules as GEX) ──
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
    let deltaPressure = "NEUTRAL";
    if (bars.length >= 3 && vwap != null) {
      const last3 = bars.slice(-3);
      const up = last3.filter((b) => b.c >= b.o).length;
      if (up >= 2 && spot >= vwap) deltaPressure = "BUYING";
      else if (up <= 1 && spot < vwap) deltaPressure = "SELLING";
    }

    // ── VEX regime labels ──
    // For VEX, magnitudes are typically smaller than GEX. Thresholds are
    // conservative ($30M dealer-delta per 1% IV); tune in code if your
    // ticker shows very different scale.
    const vexM = totalVex / 1e6;
    const regime = totalVex >= 0 ? "positive" : "negative";
    const regimeLabel = vexM >= 30 ? "HIGH POSITIVE"
                      : vexM > 0 ? "POSITIVE"
                      : vexM <= -30 ? "HIGH NEGATIVE" : "NEGATIVE";
    const aboveFlip = spot >= flip;
    // Positive VEX: dealer is net buyer when IV rises (stabilizing).
    // Negative VEX: dealer is net seller when IV rises (amplifying).
    const marketCondition = totalVex >= 0 ? "STABILIZING vs IV" : "AMPLIFYING vs IV";
    const dealerBias = totalVex >= 0 ? "BUYS ON IV RISE" : "SELLS ON IV RISE";

    const magnetCands = [
      { label: "VWAP", price: vwap },
      { label: "VANNA MID", price: vannaMid },
      { label: "VEX FLIP", price: flip },
    ].filter((c) => c.price != null);
    const magnet = magnetCands.sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot))[0]
      || { label: "VWAP", price: vwap };

    const cw1 = callWalls[0]?.strike ?? null;
    const cw2 = callWalls[1]?.strike ?? null;
    const pw1 = putWalls[0]?.strike ?? null;
    const pw2 = putWalls[1]?.strike ?? null;

    // ── Rule-based VEX trade lean ──
    let action, altAction, strength;
    if (totalVex >= 0 && aboveFlip) {
      action = "BUY CALLS — IV RISE TAILWIND"; altAction = "SELL PUT SPREADS";
      strength = 60 + (deltaPressure === "BUYING" ? 18 : 0) + (regimeLabel === "HIGH POSITIVE" ? 12 : 4);
    } else if (totalVex >= 0 && !aboveFlip) {
      action = "FADE / MEAN-REVERT"; altAction = "SELL CALL SPREADS";
      strength = 50 + (deltaPressure === "SELLING" ? 12 : 0);
    } else {
      action = "REDUCE SIZE — IV-DRIVEN CHASE RISK"; altAction = "WAIT FOR FLIP RECLAIM";
      strength = 40 + (volRegime === "EXPANSION" ? 10 : 0);
    }
    strength = Math.max(5, Math.min(98, Math.round(strength)));

    // ── Alerts ──
    let squeezeAlert = "NONE", trapAlert = "NONE";
    if (totalVex < 0 && cw1 && Math.abs(spot - cw1) / spot < 0.004) {
      squeezeAlert = `Near ${cw1} vanna wall in negative VEX`;
    }
    if (vwap != null && Math.abs(spot - vwap) / spot < 0.0015 && volRegime === "CONTRACTION") {
      trapAlert = "Coiled at VWAP — wait for IV-led direction";
    }

    res.json({
      ticker,
      available,
      spot: round(spot),
      time: etNow().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      is_live: isLive,
      session_mode: sessionMode,
      session_date: sessionDate,
      net_vex: Math.round(totalVex),
      net_vex_m: round(vexM, 2),
      regime,
      regime_label: regimeLabel,
      flip_level: round(flip),
      vanna_mid: round(vannaMid),
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
      call_walls: callWalls.map((w, i) => ({ strike: round(w.strike), label: i === 0 ? "VANNA WALL 1 (UP)" : "VANNA WALL 2 (STRONG)" })),
      put_walls: putWalls.map((w, i) => ({ strike: round(w.strike), label: i === 0 ? "VANNA WALL 1 (DN)" : "VANNA WALL 2 (STRONG)" })),
      next_key_level: cw1 ? { price: round(cw1), label: "VANNA WALL 1 (UP)" } : null,
      key_support: { price: round(vannaMid), label: "VANNA MID" },
      next_key_support: pw1 ? { price: round(pw1), label: "VANNA WALL 1 (DN)" } : null,
      signal: { action, strength },
      alternate: { action: altAction, strength: Math.max(5, strength - 6) },
      scalp_long: { zone: [round(spot), round(cw1 || spot * 1.004)],
                    t1: round(cw1 || spot * 1.004), t2: round(cw2 || cw1 || spot * 1.008) },
      scalp_short: { zone: [round(pw1 || spot * 0.996), round(spot)],
                     t1: round(vannaMid), t2: round(pw2 || pw1 || spot * 0.992) },
      invalidation: `Close below ${round(vannaMid)} (Vanna Mid)`,
      risk_note: totalVex >= 0
        ? "Positive VEX — dealer hedging is stabilizing when IV rises. Smaller size on chases."
        : "Negative VEX — IV-driven trends can extend; wider stops, smaller size.",
      squeeze_alert: squeezeAlert,
      trap_alert: trapAlert,
      note: "VEX is a modelled estimate (naive convention, Black-Scholes vanna, "
          + "near-term chain), expressed in $ dealer-delta change per 1-vol-point "
          + "(1% IV) move. VWAP and expected move are computed live. The signal, "
          + "strength, scalp and alert boxes are deterministic rules for context "
          + "— educational, not trade advice.",
    });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

export default router;
