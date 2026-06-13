// /api/profile?ticker=SPY
// Deep stock analysis. Returns:
//   - short_term / medium_term / long_term outlooks with confidence
//   - position recommendation (HOLD / TRIM / EXIT / ADD / AVOID) + rationale
//   - earnings (history + forward estimates + next date)
//   - analyst consensus + recent upgrades/downgrades
//   - company future outlook (forward EPS, revenue growth, 5y growth)
//   - key levels (support / resistance / stop / target)
//   - risk factors
//   - news headlines
//   - 200-word and detailed multi-section summaries

import { Router } from "express";
import * as data from "../services/data.js";
import * as yahoo from "../services/yahoo.js";
import {
  ema, sma, rsi, macd, adx, atr, calculatePivots,
} from "../services/indicators.js";

const router = Router();

const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
const round = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const stddev = (arr) => {
  if (!arr?.length) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};

function ratingFromMean(m) {
  if (m == null) return "N/A";
  if (m <= 1.5) return "STRONG BUY";
  if (m <= 2.5) return "BUY";
  if (m <= 3.5) return "HOLD";
  if (m <= 4.5) return "SELL";
  return "STRONG SELL";
}

function shortTermAnalysis(closes, highs, lows, volumes) {
  const last = closes.at(-1);
  const e8  = ema(closes, 8).at(-1);
  const e21 = ema(closes, 21).at(-1);
  const e50 = ema(closes, 50).at(-1);
  const r   = rsi(closes, 14);
  const m   = macd(closes);
  const ad  = adx(highs, lows, closes, 14);
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const vol = volumes.at(-1);
  const volX = avgVol ? vol / avgVol : 1;

  let score = 0; const drivers = []; const risks = [];

  if (e8 && e21 && last) {
    if (last > e8 && e8 > e21)        { score += 25; drivers.push(`Price above 8/21 EMA (bullish stack)`); }
    else if (last < e8 && e8 < e21)   { score -= 25; drivers.push(`Price below 8/21 EMA (bearish stack)`); }
    else                              { drivers.push(`EMAs are crossing — direction unclear`); }
  }
  if (r != null) {
    if (r >= 55 && r <= 75)        { score += 15; drivers.push(`RSI ${r.toFixed(0)} (bullish momentum)`); }
    else if (r >= 25 && r < 45)    { score -= 15; drivers.push(`RSI ${r.toFixed(0)} (bearish momentum)`); }
    else if (r > 75)               { score -= 5;  risks.push(`RSI ${r.toFixed(0)} — overbought, pullback risk`); }
    else if (r < 25)               { score += 5;  drivers.push(`RSI ${r.toFixed(0)} (oversold, bounce setup)`); }
  }
  if (m.histogram != null) {
    if (m.histogram > 0)           { score += 10; drivers.push(`MACD histogram positive (+${m.histogram.toFixed(2)})`); }
    else                            { score -= 10; drivers.push(`MACD histogram negative (${m.histogram.toFixed(2)})`); }
  }
  if (ad.adx >= 25) {
    if (ad.trend === "Bullish")    { score += 15; drivers.push(`ADX ${ad.adx} confirms bullish trend`); }
    else if (ad.trend === "Bearish"){ score -= 15; drivers.push(`ADX ${ad.adx} confirms bearish trend`); }
  } else {
    drivers.push(`ADX ${ad.adx} — choppy / no trend`);
  }
  if (volX >= 1.5) drivers.push(`Volume ${volX.toFixed(1)}× average — conviction`);

  const outlook = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";
  return {
    outlook, score,
    confidence: Math.min(1, Math.abs(score) / 50),
    horizon: "1–5 days",
    drivers, risks,
    action: outlook === "BULLISH" ? "GO LONG" : outlook === "BEARISH" ? "GO SHORT" : "WAIT",
  };
}

function mediumTermAnalysis(closes, highs, lows) {
  const last = closes.at(-1);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const oneMoAgo = closes.length >= 21 ? closes.at(-21) : closes[0];
  const threeMoAgo = closes.length >= 63 ? closes.at(-63) : closes[0];
  const ad = adx(highs, lows, closes, 14);
  const m = macd(closes);

  let score = 0; const drivers = []; const risks = [];

  if (sma20 != null && sma50 != null) {
    if (last > sma20 && sma20 > sma50)     { score += 25; drivers.push(`Price above 20/50 SMAs`); }
    else if (last < sma20 && sma20 < sma50){ score -= 25; drivers.push(`Price below 20/50 SMAs`); }
  }
  if (oneMoAgo) {
    const r1mo = pct(last, oneMoAgo);
    if (r1mo > 3)       { score += 12; drivers.push(`+${r1mo.toFixed(1)}% over 1 month`); }
    else if (r1mo < -3) { score -= 12; drivers.push(`${r1mo.toFixed(1)}% over 1 month`); }
  }
  if (threeMoAgo) {
    const r3mo = pct(last, threeMoAgo);
    if (r3mo > 8)       { score += 13; drivers.push(`+${r3mo.toFixed(1)}% over 3 months`); }
    else if (r3mo < -8) { score -= 13; drivers.push(`${r3mo.toFixed(1)}% over 3 months`); }
  }
  if (ad.adx >= 25 && ad.trend !== "Neutral") {
    score += (ad.trend === "Bullish" ? 1 : -1) * Math.min(15, ad.adx - 10);
    drivers.push(`ADX ${ad.adx} ${ad.trend.toLowerCase()} trend`);
  }
  if (m.signal != null && m.value != null) {
    if (m.value > m.signal) { score += 5;  drivers.push(`MACD above signal line`); }
    else                    { score -= 5;  drivers.push(`MACD below signal line`); }
  }

  const outlook = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";
  return {
    outlook, score,
    confidence: Math.min(1, Math.abs(score) / 60),
    horizon: "1–3 months",
    drivers, risks,
    action: outlook === "BULLISH" ? "ACCUMULATE" : outlook === "BEARISH" ? "REDUCE" : "HOLD",
    sma_20: round(sma20),
    return_1mo_pct: round(pct(last, oneMoAgo)),
    return_3mo_pct: round(pct(last, threeMoAgo)),
  };
}

function longTermAnalysis(closes, highs, lows) {
  const last = closes.at(-1);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const sixMoAgo = closes.length >= 126 ? closes.at(-126) : closes[0];
  const yoyAgo = closes.length >= 252 ? closes.at(-252) : null;
  const ad = adx(highs, lows, closes, 14);

  let score = 0; const drivers = []; const risks = [];

  if (sma200 != null && last != null) {
    if (last > sma200) { score += 30; drivers.push(`Price above 200-day SMA ($${sma200.toFixed(2)})`); }
    else               { score -= 30; drivers.push(`Price below 200-day SMA ($${sma200.toFixed(2)})`); }
  }
  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) { score += 15; drivers.push(`50-SMA above 200-SMA (golden cross structure)`); }
    else                { score -= 15; drivers.push(`50-SMA below 200-SMA (death cross structure)`); }
  }
  if (sixMoAgo) {
    const p6 = pct(last, sixMoAgo);
    if (p6 > 5)        { score += 10; drivers.push(`+${p6.toFixed(1)}% over 6 months`); }
    else if (p6 < -5)  { score -= 10; drivers.push(`${p6.toFixed(1)}% over 6 months`); }
  }
  if (yoyAgo) {
    const p1y = pct(last, yoyAgo);
    if (p1y > 10)      { score += 10; drivers.push(`+${p1y.toFixed(1)}% YoY`); }
    else if (p1y < -10){ score -= 10; drivers.push(`${p1y.toFixed(1)}% YoY`); }
  }
  if (ad.adx >= 25) drivers.push(`ADX ${ad.adx} confirms ${ad.trend.toLowerCase()} trend`);

  const outlook = score >= 30 ? "BULLISH" : score <= -30 ? "BEARISH" : "NEUTRAL";
  return {
    outlook, score,
    confidence: Math.min(1, Math.abs(score) / 80),
    horizon: "6 months – 1 year",
    drivers, risks,
    action: outlook === "BULLISH" ? "HOLD / ADD" : outlook === "BEARISH" ? "AVOID / EXIT" : "NEUTRAL",
    sma_50: round(sma50),
    sma_200: round(sma200),
    return_6mo_pct: round(pct(last, sixMoAgo)),
    return_1yr_pct: yoyAgo ? round(pct(last, yoyAgo)) : null,
  };
}

function positionRecommendation({ st, mt, lt, analyst, earnings, last, fiftyTwoHigh, fiftyTwoLow }) {
  const reasons = [];
  const techScore = (lt.score || 0) * 0.5 + (mt.score || 0) * 0.3 + (st.score || 0) * 0.2;
  reasons.push(`Composite technical score: ${techScore.toFixed(0)} (LT 50% / MT 30% / ST 20%)`);

  let analystTilt = 0;
  if (analyst?.rating_mean != null) {
    analystTilt = (3 - analyst.rating_mean) * 15;
    reasons.push(`Analysts: ${analyst.recommendation} (mean ${analyst.rating_mean})`);
  }

  let upsideTilt = 0;
  if (analyst?.upside_pct != null) {
    if (analyst.upside_pct >= 10)        { upsideTilt = 15;  reasons.push(`Mean price target +${analyst.upside_pct}% above current`); }
    else if (analyst.upside_pct >= 0)    { upsideTilt = 5;   reasons.push(`Mean price target +${analyst.upside_pct}% above current`); }
    else if (analyst.upside_pct <= -10)  { upsideTilt = -15; reasons.push(`Mean price target ${analyst.upside_pct}% below current — downside risk`); }
    else                                  { upsideTilt = -5;  reasons.push(`Mean price target ${analyst.upside_pct}% below current`); }
  }

  let rangeTilt = 0;
  if (fiftyTwoHigh && fiftyTwoLow && last) {
    const range = fiftyTwoHigh - fiftyTwoLow;
    const pctOfRange = range > 0 ? ((last - fiftyTwoLow) / range) * 100 : 50;
    if (pctOfRange >= 90)      { rangeTilt = -10; reasons.push(`Price at ${pctOfRange.toFixed(0)}% of 52w range — near top, extended`); }
    else if (pctOfRange >= 70) { rangeTilt = 5;   reasons.push(`Price at ${pctOfRange.toFixed(0)}% of 52w range — upper third (strong but watch)`); }
    else if (pctOfRange <= 20) { rangeTilt = -5;  reasons.push(`Price at ${pctOfRange.toFixed(0)}% of 52w range — bottom (deep value or weak)`); }
    else                        { rangeTilt = 0;   reasons.push(`Price at ${pctOfRange.toFixed(0)}% of 52w range — mid-range`); }
  }

  let earningsTilt = 0;
  if (earnings?.surprise_pct != null) {
    if (earnings.surprise_pct >= 5)       { earningsTilt = 10;  reasons.push(`Last EPS beat by ${earnings.surprise_pct}%`); }
    else if (earnings.surprise_pct <= -5) { earningsTilt = -10; reasons.push(`Last EPS missed by ${Math.abs(earnings.surprise_pct)}%`); }
  }
  if (earnings?.next_date) {
    const days = Math.floor((new Date(earnings.next_date) - Date.now()) / 86400000);
    if (days >= 0 && days <= 14) {
      reasons.push(`Earnings in ${days} day(s) — binary event risk`);
    }
  }

  const total = techScore + analystTilt + upsideTilt + rangeTilt + earningsTilt;

  let action, rationale, confidence;
  if (total >= 60) {
    action = "ADD"; confidence = 0.85;
    rationale = "Strongly bullish across timeframes + supportive analyst targets. Consider adding to a position on pullbacks to the 20-SMA.";
  } else if (total >= 25) {
    action = "HOLD"; confidence = 0.7;
    rationale = "Bullish overall — uptrend intact, fundamentals constructive. Maintain existing position; trail your stop under the 50-SMA.";
  } else if (total >= -10) {
    action = "HOLD"; confidence = 0.5;
    rationale = "Mixed signals. Hold current size, but tighten stops. Avoid adding until either a clearer breakout or pullback to long-term support.";
  } else if (total >= -40) {
    action = "TRIM"; confidence = 0.7;
    rationale = "Setup is weakening. Take 25–50% off the table to lock in gains and reduce exposure. Hold a residual position only if long-term trend remains intact.";
  } else if (total >= -70) {
    action = "EXIT"; confidence = 0.8;
    rationale = "Multiple timeframes turning bearish and risk-reward is no longer attractive. Close the position and re-evaluate after a base forms.";
  } else {
    action = "AVOID"; confidence = 0.9;
    rationale = "Strongly bearish — broken structure, weak fundamentals, no analyst support. Avoid initiation; consider hedges or shorts only with strict stops.";
  }

  return { action, confidence, total_score: round(total), rationale, reasons };
}

function keyLevels({ closes, highs, lows, st, lt, fiftyTwoHigh, fiftyTwoLow, atr14 }) {
  const last = closes.at(-1);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const pivots = calculatePivots(highs.at(-2), lows.at(-2), closes.at(-2));

  const candidates = [sma50, sma200, fiftyTwoLow, fiftyTwoHigh, pivots.PP, pivots.S1, pivots.S2, pivots.R1, pivots.R2].filter((v) => v != null);
  const supports = candidates.filter((v) => v < last).sort((a, b) => b - a).slice(0, 2);
  const resistances = candidates.filter((v) => v > last).sort((a, b) => a - b).slice(0, 2);

  const atrStop = last - 2 * (atr14 || 0);
  const smaStop = sma50 ? Math.min(sma50, last * 0.95) : last * 0.93;
  const stopLong = Math.max(atrStop, smaStop);
  const profitTarget = last + 1.5 * (last - stopLong);

  return {
    immediate_support:  round(supports[0]),
    secondary_support:  round(supports[1]),
    immediate_resistance: round(resistances[0]),
    secondary_resistance: round(resistances[1]),
    suggested_stop_long: round(stopLong),
    suggested_target_long: round(profitTarget),
    atr_14: round(atr14, 2),
    pivots: {
      PP: round(pivots.PP), R1: round(pivots.R1), R2: round(pivots.R2),
      S1: round(pivots.S1), S2: round(pivots.S2),
    },
  };
}

function riskFactors({ closes, beta, earnings, fiftyTwoHigh }) {
  const last = closes.at(-1);
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const hv = stddev(returns.slice(-30)) * Math.sqrt(252) * 100;

  let peak = -Infinity, maxDD = 0;
  closes.slice(-252).forEach((c) => { peak = Math.max(peak, c); maxDD = Math.min(maxDD, (c - peak) / peak); });

  const distFromHigh = fiftyTwoHigh ? pct(last, fiftyTwoHigh) : null;

  const flags = [];
  if (hv > 40)              flags.push(`High volatility (${hv.toFixed(0)}% annualized) — wide swings expected`);
  if (beta != null && beta > 1.3) flags.push(`Beta ${beta.toFixed(2)} — moves more than the market`);
  if (maxDD < -0.25)        flags.push(`Max drawdown ${(maxDD * 100).toFixed(0)}% last year`);
  if (distFromHigh != null && distFromHigh < -25) flags.push(`Trading ${distFromHigh.toFixed(0)}% below 52w high`);
  if (earnings?.next_date) {
    const days = Math.floor((new Date(earnings.next_date) - Date.now()) / 86400000);
    if (days >= 0 && days <= 14) flags.push(`Earnings in ${days} day(s) — IV crush + binary risk`);
  }
  if (!flags.length) flags.push("No major risk flags detected at this time");

  return {
    historical_volatility_pct: round(hv, 1),
    beta: round(beta, 2),
    max_drawdown_1y_pct: round(maxDD * 100, 1),
    distance_from_52w_high_pct: round(distFromHigh, 1),
    flags,
  };
}

function extractEarnings(s) {
  const eHist = s.earnings?.earningsChart?.quarterly || [];
  const latest = eHist.at(-1);
  const next   = s.calendarEvents?.earnings?.earningsDate?.[0]
                  ? new Date(s.calendarEvents.earnings.earningsDate[0]).toISOString().slice(0, 10)
                  : null;
  const earningsGrowth = s.financialData?.earningsGrowth ?? null;
  const revenueGrowth  = s.financialData?.revenueGrowth ?? null;

  const trend = s.earningsTrend?.trend || [];
  const nextQ = trend.find((t) => t.period === "+1q") || trend.find((t) => t.period === "0q");
  const nextY = trend.find((t) => t.period === "+1y");
  const fiveY = trend.find((t) => t.period === "+5y");

  let surprise_pct = null;
  if (latest?.actual && latest?.estimate) surprise_pct = pct(latest.actual, latest.estimate);

  return {
    next_date:           next,
    last_quarter:        latest ? latest.date : null,
    last_eps_actual:     latest?.actual ?? null,
    last_eps_estimate:   latest?.estimate ?? null,
    surprise_pct:        round(surprise_pct),
    earnings_growth_yoy: round(earningsGrowth != null ? earningsGrowth * 100 : null),
    revenue_growth_yoy:  round(revenueGrowth != null ? revenueGrowth * 100 : null),
    next_q_eps_estimate: round(nextQ?.earningsEstimate?.avg),
    next_y_eps_estimate: round(nextY?.earningsEstimate?.avg),
    next_y_growth_pct:   round(nextY?.earningsEstimate?.growth != null ? nextY.earningsEstimate.growth * 100 : null),
    five_year_growth_pct: round(fiveY?.earningsEstimate?.growth != null ? fiveY.earningsEstimate.growth * 100 : null),
    history: eHist.map((q) => ({
      quarter:  q.date,
      actual:   q.actual,
      estimate: q.estimate,
    })),
  };
}

function extractAnalyst(s, lastPrice) {
  const r = s.financialData || {};
  const tMean = r.targetMeanPrice ?? null;
  const tHigh = r.targetHighPrice ?? null;
  const tLow  = r.targetLowPrice  ?? null;
  const mean  = r.recommendationMean ?? null;
  const upside = tMean && lastPrice ? pct(tMean, lastPrice) : null;
  const trend = s.recommendationTrend?.trend?.[0] || {};

  const history = s.upgradeDowngradeHistory?.history || [];
  const recentRatings = history.slice(0, 6).map((u) => ({
    firm:     u.firm,
    action:   u.action,
    from:     u.fromGrade,
    to:       u.toGrade,
    date:     u.epochGradeDate
                ? new Date(u.epochGradeDate * 1000).toISOString().slice(0, 10)
                : null,
  }));

  return {
    recommendation: ratingFromMean(mean),
    rating_mean:    round(mean, 2),
    target_mean:    round(tMean),
    target_high:    round(tHigh),
    target_low:     round(tLow),
    upside_pct:     round(upside, 1),
    counts: {
      strongBuy:  trend.strongBuy  ?? 0,
      buy:        trend.buy        ?? 0,
      hold:       trend.hold       ?? 0,
      sell:       trend.sell       ?? 0,
      strongSell: trend.strongSell ?? 0,
    },
    analyst_count: (trend.strongBuy ?? 0) + (trend.buy ?? 0) + (trend.hold ?? 0)
                   + (trend.sell ?? 0) + (trend.strongSell ?? 0),
    recent_ratings: recentRatings,
  };
}

function futureOutlook(earnings, analyst) {
  const lines = [];

  if (earnings.next_y_growth_pct != null) {
    const dir = earnings.next_y_growth_pct >= 0 ? "growth" : "decline";
    lines.push(`Analysts model **${earnings.next_y_growth_pct >= 0 ? "+" : ""}${earnings.next_y_growth_pct}% EPS ${dir}** next fiscal year (to $${earnings.next_y_eps_estimate ?? "—"}).`);
  }
  if (earnings.five_year_growth_pct != null) {
    lines.push(`Long-term consensus is **${earnings.five_year_growth_pct >= 0 ? "+" : ""}${earnings.five_year_growth_pct}% annualized EPS growth** over the next 5 years.`);
  }
  if (earnings.revenue_growth_yoy != null) {
    lines.push(`Trailing 12-month revenue growth: **${earnings.revenue_growth_yoy >= 0 ? "+" : ""}${earnings.revenue_growth_yoy}% YoY**.`);
  }
  if (analyst.upside_pct != null && analyst.target_mean != null) {
    lines.push(`Wall Street's mean price target of **$${analyst.target_mean}** implies **${analyst.upside_pct >= 0 ? "+" : ""}${analyst.upside_pct}% ${analyst.upside_pct >= 0 ? "upside" : "downside"}** from current levels.`);
  }
  if (analyst.recent_ratings?.length) {
    const ups = analyst.recent_ratings.filter((r) => r.action === "up").length;
    const downs = analyst.recent_ratings.filter((r) => r.action === "down").length;
    if (ups + downs > 0) {
      lines.push(`Recent analyst activity: **${ups} upgrade(s)** and **${downs} downgrade(s)** in the latest set of revisions.`);
    }
  }
  if (!lines.length) lines.push("Forward guidance not available for this symbol.");

  return {
    next_year_eps:       earnings.next_y_eps_estimate,
    next_year_growth_pct: earnings.next_y_growth_pct,
    five_year_growth_pct: earnings.five_year_growth_pct,
    revenue_growth_yoy:   earnings.revenue_growth_yoy,
    analyst_target_mean:  analyst.target_mean,
    analyst_upside_pct:   analyst.upside_pct,
    narrative_points:     lines,
  };
}

function buildShortSummary({ ticker, name, price, change_pct, st, lt, earnings, analyst, news }) {
  const parts = [];
  const dailyDir = change_pct != null && change_pct >= 0 ? "up" : "down";
  parts.push(`${name || ticker} (${ticker}) trades at $${price?.toFixed(2) ?? "—"}, ${dailyDir} ${Math.abs(change_pct ?? 0).toFixed(2)}% on the session.`);

  if (st.outlook === "BULLISH") parts.push(`Short-term setup is bullish: ${st.drivers.slice(0, 2).join(", ").toLowerCase()}. ${st.action.toLowerCase()} over the next 1–5 days.`);
  else if (st.outlook === "BEARISH") parts.push(`Short-term outlook is bearish: ${st.drivers.slice(0, 2).join(", ").toLowerCase()}. Lean ${st.action.toLowerCase()}.`);
  else parts.push(`Short-term tape is neutral. Wait for a breakout.`);

  if (lt.outlook === "BULLISH") parts.push(`The 6–12 month thesis is constructive: ${lt.drivers.slice(0, 2).join(", ").toLowerCase()}. Position for ${lt.action.toLowerCase()}.`);
  else if (lt.outlook === "BEARISH") parts.push(`Long-term picture is weak. ${lt.action}.`);
  else parts.push(`Long-term trend is mixed; 200-SMA at $${lt.sma_200 ?? "—"} is the line in the sand.`);

  if (earnings?.last_eps_actual != null && earnings?.last_eps_estimate != null) {
    const beat = earnings.surprise_pct >= 0 ? "beat" : "missed";
    parts.push(`Last quarter EPS was $${earnings.last_eps_actual.toFixed(2)} (${beat} the $${earnings.last_eps_estimate.toFixed(2)} estimate by ${Math.abs(earnings.surprise_pct).toFixed(1)}%)` + (earnings.next_date ? `; next report ${earnings.next_date}.` : "."));
  }
  if (analyst?.target_mean && analyst.analyst_count) {
    const dir = analyst.upside_pct >= 0 ? "upside" : "downside";
    parts.push(`Wall Street consensus across ${analyst.analyst_count} analysts is ${analyst.recommendation} with a $${analyst.target_mean} mean target (${Math.abs(analyst.upside_pct)}% ${dir}).`);
  }
  if (news?.length) parts.push(`Recent headlines: "${news[0].title}"${news[1] ? `; "${news[1].title}"` : ""}.`);

  let text = parts.join(" ");
  const words = text.split(/\s+/);
  if (words.length > 200) text = words.slice(0, 200).join(" ") + "…";
  return text;
}

function buildDetailedSummary({ ticker, name, price, change_pct, st, mt, lt, position, earnings, analyst, levels, risk, future }) {
  return {
    technical_outlook:
      `${name} is in a ${st.outlook.toLowerCase()} short-term posture and ${mt.outlook.toLowerCase()} medium-term, with a ${lt.outlook.toLowerCase()} long-term bias. ` +
      `Key short-term drivers: ${st.drivers.slice(0, 3).join("; ")}. ` +
      (st.risks.length ? `Watch for: ${st.risks.join("; ")}. ` : "") +
      `Over a 1–3 month horizon, the setup is ${mt.action.toLowerCase()} (${mt.return_1mo_pct ?? "—"}% trailing 1mo, ${mt.return_3mo_pct ?? "—"}% trailing 3mo). ` +
      `Long-term, ${lt.action.toLowerCase()} — ${lt.drivers.slice(0, 2).join(", ").toLowerCase()}.`,

    fundamental_health:
      (earnings.last_eps_actual != null
        ? `Last quarter EPS was $${earnings.last_eps_actual.toFixed(2)} versus the $${earnings.last_eps_estimate?.toFixed(2) ?? "—"} estimate (a ${earnings.surprise_pct >= 0 ? "+" : ""}${earnings.surprise_pct}% surprise). `
        : "") +
      (earnings.earnings_growth_yoy != null ? `EPS growth is running ${earnings.earnings_growth_yoy >= 0 ? "+" : ""}${earnings.earnings_growth_yoy}% YoY, ` : "") +
      (earnings.revenue_growth_yoy != null ? `with revenue ${earnings.revenue_growth_yoy >= 0 ? "+" : ""}${earnings.revenue_growth_yoy}% YoY. ` : "") +
      (earnings.next_date ? `The next earnings report is scheduled for ${earnings.next_date}.` : "Next earnings date not yet announced."),

    sentiment:
      (analyst.analyst_count
        ? `Wall Street consensus across ${analyst.analyst_count} analysts is ${analyst.recommendation} (mean rating ${analyst.rating_mean}). ` +
          `Mean price target is $${analyst.target_mean} (${analyst.upside_pct >= 0 ? "+" : ""}${analyst.upside_pct}% from current $${price?.toFixed(2)}). ` +
          `High target: $${analyst.target_high}, low: $${analyst.target_low}. ` +
          (analyst.recent_ratings?.length
            ? `Recent activity: ${analyst.recent_ratings.slice(0, 2).map((r) => `${r.firm} ${r.action || ""} ${r.to || ""}`).join("; ")}.`
            : "")
        : "Analyst coverage is sparse or unavailable for this symbol."),

    position_recommendation:
      `**${position.action}** (confidence ${Math.round(position.confidence * 100)}%): ${position.rationale} ` +
      `Composite signals: ${position.reasons.slice(0, 3).join("; ")}.`,

    key_levels_narrative:
      `Immediate support sits at $${levels.immediate_support ?? "—"}` +
      (levels.secondary_support != null ? ` (secondary $${levels.secondary_support})` : "") +
      `. Immediate resistance at $${levels.immediate_resistance ?? "—"}` +
      (levels.secondary_resistance != null ? ` (secondary $${levels.secondary_resistance})` : "") +
      `. For long entries, a reasonable stop is $${levels.suggested_stop_long ?? "—"} (2× ATR below) with a $${levels.suggested_target_long ?? "—"} profit target — a ${(((levels.suggested_target_long - price) / (price - levels.suggested_stop_long)) || 0).toFixed(1)}:1 reward-to-risk.`,

    risk_assessment:
      `Annualized historical volatility is ${risk.historical_volatility_pct}%` +
      (risk.beta != null ? `, beta ${risk.beta}` : "") +
      `. Max drawdown in the last year was ${risk.max_drawdown_1y_pct}%. ` +
      `Currently trading ${risk.distance_from_52w_high_pct >= 0 ? "+" : ""}${risk.distance_from_52w_high_pct}% relative to the 52-week high. ` +
      `Key flags: ${risk.flags.join("; ")}.`,

    future_outlook:
      future.narrative_points.join(" "),
  };
}

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker || "SPY").toString().toUpperCase();
  try {
    const [daily, profile] = await Promise.all([
      data.getDailyBars(ticker, "2y"),
      yahoo.getProfile(ticker),
    ]);

    if (!daily?.closes?.length) {
      return res.status(200).json({
        ticker, available: false,
        error: `No price history available for ${ticker}.`,
      });
    }

    const closes  = daily.closes;
    const highs   = daily.highs;
    const lows    = daily.lows;
    const volumes = daily.volumes;
    const lastClose = closes.at(-1);
    const prevClose = closes.length > 1 ? closes.at(-2) : null;
    const changePct = prevClose ? pct(lastClose, prevClose) : 0;

    const st = shortTermAnalysis(closes, highs, lows, volumes);
    const mt = mediumTermAnalysis(closes, highs, lows);
    const lt = longTermAnalysis(closes, highs, lows);

    const earnings = extractEarnings(profile.summary || {});
    const analyst  = extractAnalyst(profile.summary || {}, lastClose);
    const sp = profile.summary?.summaryProfile || {};
    const priceMod = profile.summary?.price || {};
    const detail = profile.summary?.summaryDetail || {};
    const stats = profile.summary?.defaultKeyStatistics || {};
    const name = priceMod.longName || priceMod.shortName || ticker;
    const fiftyTwoHigh = detail.fiftyTwoWeekHigh;
    const fiftyTwoLow  = detail.fiftyTwoWeekLow;
    const beta = stats.beta;

    const atr14 = atr(highs, lows, closes, 14);
    const position = positionRecommendation({
      st, mt, lt, analyst, earnings,
      last: lastClose, fiftyTwoHigh, fiftyTwoLow,
    });
    const levels = keyLevels({ closes, highs, lows, st, lt, fiftyTwoHigh, fiftyTwoLow, atr14 });
    const risk = riskFactors({ closes, beta, earnings, fiftyTwoHigh });
    const future = futureOutlook(earnings, analyst);

    const summaryShort = buildShortSummary({
      ticker, name, price: lastClose, change_pct: changePct,
      st, lt, earnings, analyst, news: profile.news,
    });
    const summaryDetailed = buildDetailedSummary({
      ticker, name, price: lastClose, change_pct: changePct,
      st, mt, lt, position, earnings, analyst, levels, risk, future,
    });

    res.json({
      ticker,
      name,
      price: round(lastClose),
      change_pct: round(changePct, 2),
      sector: sp.sector || null,
      industry: sp.industry || null,
      website: sp.website || null,
      description: sp.longBusinessSummary || null,
      market_cap: detail.marketCap ?? null,
      pe_ratio: round(detail.trailingPE),
      forward_pe: round(detail.forwardPE),
      dividend_yield: round((detail.dividendYield ?? 0) * 100, 2),
      "52w_high": round(fiftyTwoHigh),
      "52w_low":  round(fiftyTwoLow),
      beta: round(beta),

      short_term: st,
      medium_term: mt,
      long_term: lt,

      position_recommendation: position,
      key_levels: levels,
      risk_factors: risk,
      future_outlook: future,

      earnings,
      analyst,
      news: profile.news,

      summary: summaryShort,
      detailed: summaryDetailed,
    });
  } catch (e) {
    res.status(200).json({ ticker, available: false, error: e?.message || String(e) });
  }
});

export default router;
