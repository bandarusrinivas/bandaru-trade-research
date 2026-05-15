"""Stock Screener — scan a list of tickers for actionable entry opportunities.

Runs each ticker through the same indicator engine the main dashboard uses
(pivots, EMA 8/21 cross, RSI, MACD, ADX, TTM Squeeze, Volume Confirmation),
classifies the strongest signal, and returns a sorted list ranked by signal
strength so traders can spot setups across a watchlist at a glance.

Fan-out is parallelized with ThreadPoolExecutor (default 10 concurrent fetches)
so a 20-ticker scan finishes in ~2-3 seconds instead of 20-30 seconds serial.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import yfinance as yf

from src.analysis import calculate_pivots
from src.indicators import _adx, _ema, _macd, _rsi, _stacked_emas
from src.pro_indicators import compute_pro_signals


# Cache results briefly so rapid re-renders don't pummel Yahoo
_SCREENER_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_S = 60


# ---------------------------------------------------------------------------
# Opportunity classification — ranked by strength (higher = more actionable)
# ---------------------------------------------------------------------------

OPPORTUNITY_LEVELS = {
    # Tier 1 — strongest setups (immediate action candidates)
    "SQUEEZE FIRED BULL":      {"score": 90, "direction": "bull", "color": "bull",    "kind": "Squeeze"},
    "SQUEEZE FIRED BEAR":      {"score": 90, "direction": "bear", "color": "bear",    "kind": "Squeeze"},
    "BULLISH BREAKOUT":        {"score": 85, "direction": "bull", "color": "bull",    "kind": "Breakout"},
    "BEARISH BREAKDOWN":       {"score": 85, "direction": "bear", "color": "bear",    "kind": "Breakdown"},

    # Tier 2 — strong setups (high-probability with confirmation)
    "EMA CROSS BULL":          {"score": 70, "direction": "bull", "color": "bull",    "kind": "Cross"},
    "EMA CROSS BEAR":          {"score": 70, "direction": "bear", "color": "bear",    "kind": "Cross"},
    "BULLISH BOUNCE":          {"score": 65, "direction": "bull", "color": "bull",    "kind": "Bounce"},
    "BEARISH REJECTION":       {"score": 65, "direction": "bear", "color": "bear",    "kind": "Rejection"},

    # Tier 3 — building setups (watch list, not yet trigger)
    "BULLISH MOMENTUM":        {"score": 50, "direction": "bull", "color": "bull",    "kind": "Momentum"},
    "BEARISH MOMENTUM":        {"score": 50, "direction": "bear", "color": "bear",    "kind": "Momentum"},
    "SQUEEZE COILING":         {"score": 40, "direction": "neutral", "color": "neutral", "kind": "Squeeze"},

    # Tier 4 — no actionable signal
    "NO SIGNAL":               {"score": 0,  "direction": "neutral", "color": "neutral", "kind": "—"},
}


def _classify_opportunity(daily_close, prev_close, pivots, ema8_series, ema21_series, rsi_value,
                          macd_data, adx_data, squeeze_state, momentum, current_volume,
                          avg_volume) -> tuple[str, str]:
    """Pick the BEST opportunity label for a given ticker. Returns (label, why)."""

    # 1. SQUEEZE FIRED — highest priority (sudden volatility expansion)
    if squeeze_state == "fired_bull":
        return "SQUEEZE FIRED BULL", f"TTM squeeze released with positive momentum {momentum:+.2f}"
    if squeeze_state == "fired_bear":
        return "SQUEEZE FIRED BEAR", f"TTM squeeze released with negative momentum {momentum:+.2f}"

    # 2. BREAKOUT / BREAKDOWN of nearest pivot with volume confirmation
    nearest_r = min((v for k, v in pivots.items() if k.startswith("R") and v > daily_close),
                    default=None)
    nearest_s = max((v for k, v in pivots.items() if k.startswith("S") and v < daily_close),
                    default=None)

    vol_confirmed = avg_volume and current_volume and current_volume > 1.5 * avg_volume
    above_pp = pivots.get("PP") and daily_close > pivots["PP"]
    below_pp = pivots.get("PP") and daily_close < pivots["PP"]

    # Recent breakout above R1 / R2 with volume
    if nearest_r is None or daily_close > pivots.get("R1", 0):
        if above_pp and vol_confirmed and prev_close and daily_close > prev_close:
            return "BULLISH BREAKOUT", f"Price ${daily_close:.2f} broke above R1 on {current_volume/avg_volume:.1f}× volume"

    if nearest_s is None or daily_close < pivots.get("S1", 1e9):
        if below_pp and vol_confirmed and prev_close and daily_close < prev_close:
            return "BEARISH BREAKDOWN", f"Price ${daily_close:.2f} broke below S1 on {current_volume/avg_volume:.1f}× volume"

    # 3. EMA 8/21 cross — recent (last 2 bars)
    if len(ema8_series) >= 3 and len(ema21_series) >= 3:
        e8_now, e8_prev = ema8_series[-1], ema8_series[-2]
        e21_now, e21_prev = ema21_series[-1], ema21_series[-2]
        if e8_now and e8_prev and e21_now and e21_prev:
            if e8_prev <= e21_prev and e8_now > e21_now:
                return "EMA CROSS BULL", f"EMA 8 crossed above EMA 21 (today)"
            if e8_prev >= e21_prev and e8_now < e21_now:
                return "EMA CROSS BEAR", f"EMA 8 crossed below EMA 21 (today)"

    # 4. BOUNCE / REJECTION — price testing a level (within 0.3%)
    if nearest_s and (daily_close - nearest_s) / daily_close < 0.003 and rsi_value and rsi_value < 40:
        return "BULLISH BOUNCE", f"Price at support ${nearest_s:.2f}, RSI {rsi_value:.0f} (oversold)"
    if nearest_r and (nearest_r - daily_close) / daily_close < 0.003 and rsi_value and rsi_value > 60:
        return "BEARISH REJECTION", f"Price at resistance ${nearest_r:.2f}, RSI {rsi_value:.0f} (overbought)"

    # 5. MOMENTUM via MACD histogram + ADX strength
    macd_hist = macd_data.get("histogram") if macd_data else None
    adx_v = adx_data.get("adx") if adx_data else None
    if adx_v and adx_v >= 25:
        if macd_hist and macd_hist > 0 and adx_data.get("trend") == "Bullish":
            return "BULLISH MOMENTUM", f"ADX {adx_v:.1f} strong bullish · MACD hist +{macd_hist:.2f}"
        if macd_hist and macd_hist < 0 and adx_data.get("trend") == "Bearish":
            return "BEARISH MOMENTUM", f"ADX {adx_v:.1f} strong bearish · MACD hist {macd_hist:.2f}"

    # 6. SQUEEZE COILING — low volatility, big move pending
    if squeeze_state == "in_squeeze":
        return "SQUEEZE COILING", "TTM squeeze active — volatility compressed, breakout pending"

    return "NO SIGNAL", "No active setup"


# ---------------------------------------------------------------------------
# Per-ticker screen — does all the heavy lifting for a single symbol
# ---------------------------------------------------------------------------

def _screen_ticker(symbol: str) -> Optional[dict]:
    """Run the full indicator pipeline on one ticker. Return None on data failure."""
    try:
        t = yf.Ticker(symbol)
        # Daily bars for trend + indicators
        daily = t.history(period="6mo", interval="1d")
        if daily.empty or len(daily) < 30:
            return None
        closes = [float(x) for x in daily["Close"].tolist()]
        highs = [float(x) for x in daily["High"].tolist()]
        lows = [float(x) for x in daily["Low"].tolist()]
        volumes = [float(x) for x in daily["Volume"].tolist()]

        # Current price = latest close. Previous = day before.
        current_price = closes[-1]
        prev_close = closes[-2] if len(closes) >= 2 else None
        change_pct = ((current_price - prev_close) / prev_close * 100) if prev_close else 0.0

        # Pivots from the previous DAILY bar
        if len(closes) >= 2:
            pivots = calculate_pivots(highs[-2], lows[-2], closes[-2])
        else:
            pivots = {}

        # Indicators
        ema8 = _ema(closes, 8)
        ema21 = _ema(closes, 21)
        ema50 = _ema(closes, 50)
        rsi_val = _rsi(closes, 14)
        macd_full = _macd(closes)
        adx_data = _adx(highs, lows, closes, 14)
        stacked = _stacked_emas(closes)

        # Pro signals (TTM Squeeze, VC) — uses its own data fetch internally
        pro = compute_pro_signals(symbol)
        squeeze = pro.get("squeeze", {}) if isinstance(pro, dict) else {}
        squeeze_state = None
        if squeeze.get("in_squeeze"):
            squeeze_state = "in_squeeze"
        elif squeeze.get("fired") == "bullish":
            squeeze_state = "fired_bull"
        elif squeeze.get("fired") == "bearish":
            squeeze_state = "fired_bear"
        momentum = squeeze.get("momentum", 0)

        # Volume
        current_volume = volumes[-1] if volumes else 0
        avg_volume = sum(volumes[-20:]) / min(20, len(volumes)) if volumes else 0

        # Classify
        opp_label, opp_why = _classify_opportunity(
            current_price, prev_close, pivots, ema8, ema21, rsi_val,
            macd_full, adx_data, squeeze_state, momentum,
            current_volume, avg_volume,
        )
        opp_info = OPPORTUNITY_LEVELS[opp_label]

        return {
            "ticker": symbol,
            "price": round(current_price, 2),
            "change_pct": round(change_pct, 2),
            "opportunity": opp_label,
            "opportunity_kind": opp_info["kind"],
            "direction": opp_info["direction"],
            "score": opp_info["score"],
            "color": opp_info["color"],
            "why": opp_why,
            "rsi": round(rsi_val, 1) if rsi_val else None,
            "adx": adx_data.get("adx"),
            "trend": adx_data.get("trend"),
            "stacked_emas": stacked.get("stack"),
            "macd_hist": round(macd_full["histogram"], 3) if macd_full and macd_full.get("histogram") is not None else None,
            "volume_x_avg": round(current_volume / avg_volume, 2) if avg_volume else None,
            "in_squeeze": squeeze_state == "in_squeeze",
            "squeeze_fired": squeeze_state in ("fired_bull", "fired_bear"),
            "pivots": pivots,
        }
    except Exception as e:
        return {
            "ticker": symbol,
            "error": f"{type(e).__name__}: {e}",
            "score": -1,
        }


# ---------------------------------------------------------------------------
# Public API — run the screener
# ---------------------------------------------------------------------------

def screen_stocks(symbols: list[str], max_workers: int = 10,
                  use_cache: bool = True) -> dict:
    """Screen a list of tickers in parallel, return ranked entry opportunities.

    Args:
        symbols: List of ticker symbols to scan
        max_workers: Concurrent yfinance fetches (default 10)
        use_cache: Honor 60-second cache (default True)

    Returns:
        {
            "results": [...],   # sorted by score desc
            "count": int,
            "elapsed_ms": int,
            "cached": bool,
        }
    """
    # Normalize + de-dupe
    symbols = list(dict.fromkeys(s.strip().upper() for s in symbols if s and s.strip()))[:50]
    if not symbols:
        return {"results": [], "count": 0, "elapsed_ms": 0, "cached": False}

    # Cache key = sorted ticker list
    cache_key = ",".join(sorted(symbols))
    now = time.time()
    if use_cache and cache_key in _SCREENER_CACHE:
        cached_at, cached_result = _SCREENER_CACHE[cache_key]
        if now - cached_at < _CACHE_TTL_S:
            cached_result = dict(cached_result)
            cached_result["cached"] = True
            return cached_result

    start = time.time()
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_screen_ticker, sym): sym for sym in symbols}
        for fut in as_completed(futures):
            res = fut.result()
            if res:
                results.append(res)

    # Sort: highest score first, then by abs change % (movers first)
    results.sort(key=lambda r: (-(r.get("score", 0)), -abs(r.get("change_pct", 0))))

    out = {
        "results": results,
        "count": len(results),
        "elapsed_ms": int((time.time() - start) * 1000),
        "cached": False,
    }
    _SCREENER_CACHE[cache_key] = (now, out)
    return out


# Default screener list — large caps + popular day-trading names
DEFAULT_SCREENER_SYMBOLS = [
    "SPY", "QQQ", "IWM", "DIA",       # major indices
    "AAPL", "MSFT", "GOOGL", "META",  # big tech
    "NVDA", "AMD", "TSLA", "AMZN",    # high-volume movers
    "JPM", "BAC", "GS",                # financials
    "XOM", "CVX",                      # energy
    "UNH", "JNJ",                      # healthcare
]
