"""Pivot-point support/resistance analysis + 0DTE strike recommendations."""
from __future__ import annotations

from datetime import datetime

import pytz


def calculate_pivots(prev_high: float, prev_low: float, prev_close: float) -> dict:
    """Classic floor-trader pivot points: PP, R1-R3, S1-S3."""
    pp = (prev_high + prev_low + prev_close) / 3
    r1 = 2 * pp - prev_low
    s1 = 2 * pp - prev_high
    r2 = pp + (prev_high - prev_low)
    s2 = pp - (prev_high - prev_low)
    r3 = prev_high + 2 * (pp - prev_low)
    s3 = prev_low - 2 * (prev_high - pp)
    return {
        "S3": round(s3, 2),
        "S2": round(s2, 2),
        "S1": round(s1, 2),
        "PP": round(pp, 2),
        "R1": round(r1, 2),
        "R2": round(r2, 2),
        "R3": round(r3, 2),
    }


def get_today_expiration() -> str:
    et = pytz.timezone("America/New_York")
    return datetime.now(et).strftime("%Y-%m-%d")


def _nearest(values: list[float], target: float) -> float:
    return min(values, key=lambda v: abs(v - target))


# Distance thresholds (% of SPY price) for status state transitions
GO_THRESHOLD_PCT = 0.05    # within 0.05% = at the level
READY_THRESHOLD_PCT = 0.20  # within 0.20% = getting close
INVALID_THRESHOLD_PCT = 0.30  # past the level by 0.30% = bounce/rejection invalidated


def _signal_status(rec_id: str, current_price: float, entry_spy: float, ticker: str = "SPY") -> dict:
    """Compute a trade-card status: GO / READY / STANDBY / INVALID.

    Returns dict with keys: status, label, reason, distance_pct.
    """
    if entry_spy is None or current_price is None or entry_spy == 0:
        return {
            "status": "STANDBY", "label": "STANDBY",
            "reason": "No price data", "distance_pct": None,
        }

    pct_diff = (current_price - entry_spy) / entry_spy * 100

    # BULL BREAKOUT — GO when SPY ≥ entry (broken out above)
    if rec_id == "bull_call_break":
        if current_price >= entry_spy:
            return {
                "status": "GO", "label": "GO — ENTRY NOW",
                "reason": f"{ticker} broke ABOVE {entry_spy} ({pct_diff:+.2f}% from trigger)",
                "distance_pct": round(pct_diff, 3),
            }
        elif current_price >= entry_spy * (1 - READY_THRESHOLD_PCT / 100):
            return {
                "status": "READY", "label": "READY — at the level",
                "reason": f"{ticker} {abs(pct_diff):.2f}% below trigger — closing in",
                "distance_pct": round(pct_diff, 3),
            }
        else:
            return {
                "status": "STANDBY", "label": "STANDBY",
                "reason": f"{ticker} needs {abs(pct_diff):.2f}% more to break out",
                "distance_pct": round(pct_diff, 3),
            }

    # BEAR BREAKDOWN — GO when SPY ≤ entry (broken below)
    if rec_id == "bear_put_break":
        if current_price <= entry_spy:
            return {
                "status": "GO", "label": "GO — ENTRY NOW",
                "reason": f"{ticker} broke BELOW {entry_spy} ({pct_diff:+.2f}% from trigger)",
                "distance_pct": round(pct_diff, 3),
            }
        elif current_price <= entry_spy * (1 + READY_THRESHOLD_PCT / 100):
            return {
                "status": "READY", "label": "READY — at the level",
                "reason": f"{ticker} {abs(pct_diff):.2f}% above trigger — closing in",
                "distance_pct": round(pct_diff, 3),
            }
        else:
            return {
                "status": "STANDBY", "label": "STANDBY",
                "reason": f"{ticker} needs {abs(pct_diff):.2f}% drop to break down",
                "distance_pct": round(pct_diff, 3),
            }

    # BULL BOUNCE — GO when at support, INVALID if broken below
    if rec_id == "bull_call_bounce":
        if abs(pct_diff) < GO_THRESHOLD_PCT:
            return {
                "status": "GO", "label": "GO — AT SUPPORT",
                "reason": f"{ticker} at bounce level ({pct_diff:+.2f}%) — look for bullish reversal candle",
                "distance_pct": round(pct_diff, 3),
            }
        elif pct_diff < -INVALID_THRESHOLD_PCT:
            return {
                "status": "INVALID", "label": "INVALID — broke support",
                "reason": f"{ticker} {abs(pct_diff):.2f}% below support — bounce thesis dead",
                "distance_pct": round(pct_diff, 3),
            }
        elif abs(pct_diff) < READY_THRESHOLD_PCT:
            return {
                "status": "READY", "label": "READY — at the level",
                "reason": f"{ticker} {abs(pct_diff):.2f}% from support",
                "distance_pct": round(pct_diff, 3),
            }
        else:
            return {
                "status": "STANDBY", "label": "STANDBY",
                "reason": f"{ticker} watching — {abs(pct_diff):.2f}% from support",
                "distance_pct": round(pct_diff, 3),
            }

    # BEAR REJECTION — GO when at resistance, INVALID if broken above
    if rec_id == "bear_put_rejection":
        if abs(pct_diff) < GO_THRESHOLD_PCT:
            return {
                "status": "GO", "label": "GO — AT RESISTANCE",
                "reason": f"{ticker} at rejection level ({pct_diff:+.2f}%) — look for bearish reversal candle",
                "distance_pct": round(pct_diff, 3),
            }
        elif pct_diff > INVALID_THRESHOLD_PCT:
            return {
                "status": "INVALID", "label": "INVALID — broke resistance",
                "reason": f"{ticker} {pct_diff:.2f}% above resistance — rejection thesis dead",
                "distance_pct": round(pct_diff, 3),
            }
        elif abs(pct_diff) < READY_THRESHOLD_PCT:
            return {
                "status": "READY", "label": "READY — at the level",
                "reason": f"{ticker} {abs(pct_diff):.2f}% from resistance",
                "distance_pct": round(pct_diff, 3),
            }
        else:
            return {
                "status": "STANDBY", "label": "STANDBY",
                "reason": f"{ticker} watching — {abs(pct_diff):.2f}% from resistance",
                "distance_pct": round(pct_diff, 3),
            }

    return {
        "status": "STANDBY", "label": "STANDBY",
        "reason": "Unknown setup", "distance_pct": round(pct_diff, 3),
    }


# --- Day-trading stat helpers ----------------------------------------------
def put_call_ratio(contracts: list[dict]) -> dict:
    """Volume + open-interest put/call ratios for the given chain.

    P/C > 1 = bearish skew; P/C < 1 = bullish skew. Typical SPY range 0.7-1.3.
    """
    call_vol = call_oi = put_vol = put_oi = 0
    for c in contracts:
        v = c.get("volume") or 0
        oi = c.get("open_interest") or 0
        if c.get("type") == "call":
            call_vol += v
            call_oi += oi
        elif c.get("type") == "put":
            put_vol += v
            put_oi += oi
    return {
        "volume_ratio": round(put_vol / call_vol, 2) if call_vol else None,
        "oi_ratio": round(put_oi / call_oi, 2) if call_oi else None,
        "call_volume": call_vol,
        "put_volume": put_vol,
        "call_oi": call_oi,
        "put_oi": put_oi,
    }


def max_pain(contracts: list[dict]) -> float | None:
    """Strike at which total open-interest pain is minimized.

    Max pain = the strike where the most options expire worthless. For 0DTE
    SPY this is often a price magnet into the close.
    """
    by_strike: dict[float, dict] = {}
    for c in contracts:
        s = c.get("strike")
        if s is None:
            continue
        node = by_strike.setdefault(s, {"call_oi": 0, "put_oi": 0})
        if c.get("type") == "call":
            node["call_oi"] += c.get("open_interest") or 0
        elif c.get("type") == "put":
            node["put_oi"] += c.get("open_interest") or 0

    if not by_strike:
        return None
    strikes = sorted(by_strike.keys())
    best_strike = strikes[0]
    best_pain = float("inf")
    for test in strikes:
        pain = 0.0
        for s, oi in by_strike.items():
            if s < test:
                pain += oi["call_oi"] * (test - s)
            elif s > test:
                pain += oi["put_oi"] * (s - test)
        if pain < best_pain:
            best_pain = pain
            best_strike = test
    return best_strike


def option_levels(contracts: list[dict]) -> dict:
    """Key option-chain strike levels to overlay on the price chart.

    Returns max-pain plus the strikes carrying the heaviest call/put open-interest
    and today's heaviest call/put volume — these act as dealer-hedge magnets and
    are widely-used intraday day-trading levels.
    """
    if not contracts:
        return {
            "max_pain": None,
            "top_call_oi": None, "top_call_oi_strike": None,
            "top_put_oi": None, "top_put_oi_strike": None,
            "top_call_vol": None, "top_call_vol_strike": None,
            "top_put_vol": None, "top_put_vol_strike": None,
        }

    def _best(predicate, sort_key):
        rows = [c for c in contracts if predicate(c)]
        if not rows:
            return None
        return max(rows, key=sort_key)

    tco = _best(lambda c: c.get("type") == "call" and (c.get("open_interest") or 0) > 0,
                lambda c: c.get("open_interest") or 0)
    tpo = _best(lambda c: c.get("type") == "put" and (c.get("open_interest") or 0) > 0,
                lambda c: c.get("open_interest") or 0)
    tcv = _best(lambda c: c.get("type") == "call" and (c.get("volume") or 0) > 0,
                lambda c: c.get("volume") or 0)
    tpv = _best(lambda c: c.get("type") == "put" and (c.get("volume") or 0) > 0,
                lambda c: c.get("volume") or 0)

    return {
        "max_pain": max_pain(contracts),
        "top_call_oi_strike": tco["strike"] if tco else None,
        "top_call_oi": tco["open_interest"] if tco else None,
        "top_put_oi_strike": tpo["strike"] if tpo else None,
        "top_put_oi": tpo["open_interest"] if tpo else None,
        "top_call_vol_strike": tcv["strike"] if tcv else None,
        "top_call_vol": tcv["volume"] if tcv else None,
        "top_put_vol_strike": tpv["strike"] if tpv else None,
        "top_put_vol": tpv["volume"] if tpv else None,
    }


def market_stats(
    current_price: float,
    pivots: dict,
    prev_day: dict,
    quote: dict,
    contracts: list[dict],
) -> dict:
    """Bundle of at-a-glance day-trading stats."""
    pcr = put_call_ratio(contracts)
    mp = max_pain(contracts)

    # Today's session stats
    day_open = quote.get("day_open")
    day_high = quote.get("day_high")
    day_low = quote.get("day_low")
    day_range = (day_high - day_low) if (day_high and day_low) else None

    # Previous-day range — a rough single-day ATR proxy
    prev_range = (prev_day.get("high", 0) - prev_day.get("low", 0)) or None

    # Day-to-prev range expansion (>1 = today is wider, <1 = consolidating)
    range_expansion = (
        round(day_range / prev_range, 2) if (day_range and prev_range) else None
    )

    # Distance to nearest support / resistance, as $ and %
    above = sorted([v for v in pivots.values() if v > current_price])
    below = sorted([v for v in pivots.values() if v < current_price], reverse=True)
    nearest_res = above[0] if above else None
    nearest_sup = below[0] if below else None

    return {
        "put_call": pcr,
        "max_pain": mp,
        "max_pain_distance": round(mp - current_price, 2) if mp else None,
        "day_range": round(day_range, 2) if day_range else None,
        "prev_day_range": round(prev_range, 2) if prev_range else None,
        "range_expansion": range_expansion,
        "day_position_pct": (
            round((current_price - day_low) / (day_high - day_low) * 100, 1)
            if (day_high and day_low and day_high > day_low)
            else None
        ),
        "nearest_resistance": nearest_res,
        "nearest_support": nearest_sup,
        "dist_to_resistance": (
            round(nearest_res - current_price, 2) if nearest_res else None
        ),
        "dist_to_support": (
            round(current_price - nearest_sup, 2) if nearest_sup else None
        ),
        "dist_to_resistance_pct": (
            round((nearest_res - current_price) / current_price * 100, 2)
            if nearest_res
            else None
        ),
        "dist_to_support_pct": (
            round((current_price - nearest_sup) / current_price * 100, 2)
            if nearest_sup
            else None
        ),
    }


def build_recommendations(
    current_price: float, pivots: dict, contracts: list[dict], ticker: str = "SPY"
) -> list[dict]:
    """Build 0DTE trade ideas anchored to pivot S/R levels."""
    calls = sorted(
        [c for c in contracts if c.get("type") == "call" and c.get("strike")],
        key=lambda x: x["strike"],
    )
    puts = sorted(
        [c for c in contracts if c.get("type") == "put" and c.get("strike")],
        key=lambda x: x["strike"],
    )

    resistances = sorted(
        [(k, v) for k, v in pivots.items() if v > current_price], key=lambda x: x[1]
    )
    supports = sorted(
        [(k, v) for k, v in pivots.items() if v < current_price],
        key=lambda x: x[1],
        reverse=True,
    )

    recs: list[dict] = []
    atm = round(current_price)

    # 1. Bullish breakout
    if resistances and calls:
        nr = resistances[0]
        next_r = resistances[1] if len(resistances) > 1 else None
        strike = _nearest([c["strike"] for c in calls], atm)
        call = next(c for c in calls if c["strike"] == strike)
        delta = call.get("delta") or 0.5
        target_spy = next_r[1] if next_r else nr[1] + (nr[1] - current_price)
        move = target_spy - current_price
        projected = call["mid"] + delta * move
        recs.append({
            "id": "bull_call_break",
            "strategy": f"Long CALL — Break above {nr[0]} ({nr[1]})",
            "direction": "bullish",
            "type": "CALL",
            "strike": call["strike"],
            "ticker": call["ticker"],
            "current_premium": call["mid"],
            "bid": call["bid"],
            "ask": call["ask"],
            "delta": delta,
            "entry_trigger": f"{ticker} closes a 5-min candle above {nr[1]}",
            "entry_spy_price": nr[1],
            "profit_target_spy": round(target_spy, 2),
            "profit_target_premium": round(projected, 2),
            "stop_loss_premium": round(call["mid"] * 0.5, 2),
            "stop_loss_spy": round(nr[1] - 0.3, 2),
            "reasoning": (
                f"Resistance at {nr[0]} ({nr[1]}). Break targets "
                f"{(next_r[0] + ' ' if next_r else '')}{target_spy:.2f}."
            ),
        })

    # 2. Bearish breakdown
    if supports and puts:
        ns = supports[0]
        next_s = supports[1] if len(supports) > 1 else None
        strike = _nearest([p["strike"] for p in puts], atm)
        put = next(p for p in puts if p["strike"] == strike)
        delta_abs = abs(put.get("delta") or -0.5)
        target_spy = next_s[1] if next_s else ns[1] - (current_price - ns[1])
        move = current_price - target_spy
        projected = put["mid"] + delta_abs * move
        recs.append({
            "id": "bear_put_break",
            "strategy": f"Long PUT — Break below {ns[0]} ({ns[1]})",
            "direction": "bearish",
            "type": "PUT",
            "strike": put["strike"],
            "ticker": put["ticker"],
            "current_premium": put["mid"],
            "bid": put["bid"],
            "ask": put["ask"],
            "delta": put.get("delta"),
            "entry_trigger": f"{ticker} closes a 5-min candle below {ns[1]}",
            "entry_spy_price": ns[1],
            "profit_target_spy": round(target_spy, 2),
            "profit_target_premium": round(projected, 2),
            "stop_loss_premium": round(put["mid"] * 0.5, 2),
            "stop_loss_spy": round(ns[1] + 0.3, 2),
            "reasoning": (
                f"Support at {ns[0]} ({ns[1]}). Breakdown targets "
                f"{(next_s[0] + ' ' if next_s else '')}{target_spy:.2f}."
            ),
        })

    # 3. Bullish bounce
    if supports and calls:
        ns = supports[0]
        if (current_price - ns[1]) / current_price < 0.003:
            target = (
                pivots["PP"]
                if pivots["PP"] > current_price
                else (resistances[0][1] if resistances else current_price * 1.005)
            )
            strike = _nearest([c["strike"] for c in calls], atm)
            call = next(c for c in calls if c["strike"] == strike)
            delta = call.get("delta") or 0.5
            move = target - current_price
            projected = call["mid"] + delta * move
            recs.append({
                "id": "bull_call_bounce",
                "strategy": f"Long CALL — Bounce from {ns[0]} ({ns[1]})",
                "direction": "bullish",
                "type": "CALL",
                "strike": call["strike"],
                "ticker": call["ticker"],
                "current_premium": call["mid"],
                "bid": call["bid"],
                "ask": call["ask"],
                "delta": delta,
                "entry_trigger": f"Bullish reversal candle at {ns[1]}",
                "entry_spy_price": ns[1],
                "profit_target_spy": round(target, 2),
                "profit_target_premium": round(projected, 2),
                "stop_loss_premium": round(call["mid"] * 0.5, 2),
                "stop_loss_spy": round(ns[1] - 0.5, 2),
                "reasoning": (
                    f"{ticker} testing support {ns[0]} ({ns[1]}). Bounce targets {target:.2f}."
                ),
            })

    # 4. Bearish rejection
    if resistances and puts:
        nr = resistances[0]
        if (nr[1] - current_price) / current_price < 0.003:
            target = (
                pivots["PP"]
                if pivots["PP"] < current_price
                else (supports[0][1] if supports else current_price * 0.995)
            )
            strike = _nearest([p["strike"] for p in puts], atm)
            put = next(p for p in puts if p["strike"] == strike)
            delta_abs = abs(put.get("delta") or -0.5)
            move = current_price - target
            projected = put["mid"] + delta_abs * move
            recs.append({
                "id": "bear_put_rejection",
                "strategy": f"Long PUT — Rejection at {nr[0]} ({nr[1]})",
                "direction": "bearish",
                "type": "PUT",
                "strike": put["strike"],
                "ticker": put["ticker"],
                "current_premium": put["mid"],
                "bid": put["bid"],
                "ask": put["ask"],
                "delta": put.get("delta"),
                "entry_trigger": f"Bearish rejection candle at {nr[1]}",
                "entry_spy_price": nr[1],
                "profit_target_spy": round(target, 2),
                "profit_target_premium": round(projected, 2),
                "stop_loss_premium": round(put["mid"] * 0.5, 2),
                "stop_loss_spy": round(nr[1] + 0.5, 2),
                "reasoning": (
                    f"{ticker} testing resistance {nr[0]} ({nr[1]}). Rejection targets {target:.2f}."
                ),
            })

    # Attach live status + entry validity note to each recommendation
    for r in recs:
        s = _signal_status(r["id"], current_price, r.get("entry_spy_price"), ticker)
        r["status"] = s["status"]
        r["status_label"] = s["label"]
        r["status_reason"] = s["reason"]
        r["distance_pct"] = s["distance_pct"]
        # Entry validity note — why this trade IS or IS NOT good right now
        if s["status"] == "GO":
            r["validity_note"] = (
                f"✅ ENTRY VALID NOW. {s['reason']} "
                f"Risk = ${abs(r['entry_spy_price'] - r['stop_loss_spy']):.2f} per {ticker} share. "
                f"Reward = ${abs(r['profit_target_spy'] - r['entry_spy_price']):.2f}."
            )
        elif s["status"] == "READY":
            r["validity_note"] = (
                f"⏰ ALMOST. {s['reason']} "
                f"Set a price alert at ${r['entry_spy_price']} and have your order ticket pre-filled."
            )
        elif s["status"] == "INVALID":
            r["validity_note"] = (
                f"❌ INVALID. {s['reason']} "
                f"Don't take this trade — the setup precondition is broken. Wait for a new pivot test."
            )
        else:  # STANDBY
            r["validity_note"] = (
                f"👀 WATCHING. {s['reason']} "
                f"No action — keep this on your radar."
            )

    # Sort: GO first, READY second, STANDBY third, INVALID last
    priority = {"GO": 0, "READY": 1, "STANDBY": 2, "INVALID": 3}
    recs.sort(key=lambda r: priority.get(r.get("status"), 99))

    return recs
