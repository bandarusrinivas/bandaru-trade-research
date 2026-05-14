"""Technical indicators for SPY day trading.

Computes:
  - Trailing (lagging) indicators: SMA9, SMA20, SMA50, EMA9, EMA20, ATR14, Bollinger Bands
  - Leading (momentum) indicators: RSI14, MACD (12,26,9), Stochastic %K %D

Uses yfinance for daily bars — sufficient for daily-timeframe indicators that
inform a 0DTE day-trade. Intraday indicators would need a real-time data feed
(Schwab/Tradier/etc.) which we may not have yet.
"""
from __future__ import annotations

from typing import Optional

try:
    import yfinance as yf
except ImportError:
    yf = None


def _ema(values: list[float], period: int) -> list[float]:
    if len(values) < period or period <= 0:
        return []
    k = 2 / (period + 1)
    ema = [sum(values[:period]) / period]
    for v in values[period:]:
        ema.append(v * k + ema[-1] * (1 - k))
    # Pad to align with `values` length
    return [None] * (period - 1) + ema


def _sma(values: list[float], period: int) -> list[float]:
    if period <= 0:
        return []
    out: list = [None] * (period - 1)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        out.append(sum(window) / period)
    return out


def _rsi(closes: list[float], period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def _macd(closes: list[float]) -> dict:
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    macd_line = [
        (a - b) if (a is not None and b is not None) else None
        for a, b in zip(ema12, ema26)
    ]
    macd_clean = [v for v in macd_line if v is not None]
    signal_line = _ema(macd_clean, 9)
    if not macd_clean or not signal_line or signal_line[-1] is None:
        return {"macd": None, "signal": None, "hist": None, "trend": None}
    macd_val = round(macd_clean[-1], 3)
    signal_val = round(signal_line[-1], 3)
    hist = round(macd_val - signal_val, 3)
    if hist > 0:
        trend = "bullish"
    elif hist < 0:
        trend = "bearish"
    else:
        trend = "neutral"
    return {
        "macd": macd_val,
        "signal": signal_val,
        "hist": hist,
        "trend": trend,
    }


def _atr(highs, lows, closes, period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    trs: list[float] = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if len(trs) < period:
        return None
    atr = sum(trs[:period]) / period
    for tr in trs[period:]:
        atr = (atr * (period - 1) + tr) / period
    return round(atr, 2)


def _bbands(closes: list[float], period: int = 20, n_std: float = 2.0) -> dict:
    if len(closes) < period:
        return {"upper": None, "mid": None, "lower": None, "width_pct": None}
    window = closes[-period:]
    mid = sum(window) / period
    variance = sum((x - mid) ** 2 for x in window) / period
    sd = variance ** 0.5
    upper = mid + n_std * sd
    lower = mid - n_std * sd
    width_pct = round((upper - lower) / mid * 100, 2) if mid else None
    return {
        "upper": round(upper, 2),
        "mid": round(mid, 2),
        "lower": round(lower, 2),
        "width_pct": width_pct,
    }


def _stoch(highs, lows, closes, period: int = 14, smooth: int = 3) -> dict:
    if len(closes) < period:
        return {"k": None, "d": None}
    ks: list[float] = []
    for i in range(period - 1, len(closes)):
        hh = max(highs[i - period + 1 : i + 1])
        ll = min(lows[i - period + 1 : i + 1])
        if hh == ll:
            ks.append(50.0)
        else:
            ks.append((closes[i] - ll) / (hh - ll) * 100)
    if not ks:
        return {"k": None, "d": None}
    k = round(ks[-1], 1)
    d_vals = _sma(ks, smooth)
    d = round(d_vals[-1], 1) if d_vals and d_vals[-1] is not None else None
    return {"k": k, "d": d}


def _signal_label(value: Optional[float], oversold: float, overbought: float) -> str:
    if value is None:
        return "—"
    if value >= overbought:
        return "Overbought"
    if value <= oversold:
        return "Oversold"
    return "Neutral"


def _adx(highs, lows, closes, period: int = 14) -> dict:
    """ADX (Average Directional Index) with +DI and -DI.

    ADX > 25 = strong trend; ADX < 20 = ranging market.
    +DI > -DI = bullish trend; -DI > +DI = bearish trend.
    """
    if len(closes) < period * 2 + 1:
        return {"adx": None, "plus_di": None, "minus_di": None, "trend": None, "strength": None}

    plus_dm, minus_dm, tr = [], [], []
    for i in range(1, len(closes)):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm.append(up if (up > down and up > 0) else 0)
        minus_dm.append(down if (down > up and down > 0) else 0)
        tr.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))

    # Wilder smoothing
    def wilder(values, p):
        if len(values) < p:
            return []
        out = [sum(values[:p])]
        for v in values[p:]:
            out.append(out[-1] - (out[-1] / p) + v)
        return out

    sm_tr = wilder(tr, period)
    sm_plus = wilder(plus_dm, period)
    sm_minus = wilder(minus_dm, period)
    if not sm_tr or sm_tr[-1] == 0:
        return {"adx": None, "plus_di": None, "minus_di": None, "trend": None, "strength": None}

    plus_di_series = [100 * (p / t) if t else 0 for p, t in zip(sm_plus, sm_tr)]
    minus_di_series = [100 * (m / t) if t else 0 for m, t in zip(sm_minus, sm_tr)]
    dx_series = []
    for p, m in zip(plus_di_series, minus_di_series):
        denom = p + m
        dx_series.append(100 * abs(p - m) / denom if denom else 0)
    if len(dx_series) < period:
        return {"adx": None, "plus_di": None, "minus_di": None, "trend": None, "strength": None}
    adx_smoothed = wilder(dx_series, period)
    if not adx_smoothed:
        return {"adx": None, "plus_di": None, "minus_di": None, "trend": None, "strength": None}

    adx_val = adx_smoothed[-1] / period  # approximate smoothing
    plus = plus_di_series[-1]
    minus = minus_di_series[-1]

    if adx_val >= 40:
        strength = "Very Strong"
    elif adx_val >= 25:
        strength = "Strong"
    elif adx_val >= 20:
        strength = "Developing"
    else:
        strength = "Ranging"

    trend = "Bullish" if plus > minus else "Bearish"

    return {
        "adx": round(adx_val, 2),
        "plus_di": round(plus, 2),
        "minus_di": round(minus, 2),
        "trend": trend,
        "strength": strength,
    }


def _stacked_emas(closes: list[float]) -> dict:
    """TOS-style "Stacked EMA" indicator with D8 / D21 / D50 hierarchy."""
    if len(closes) < 50:
        return {"d8": None, "d21": None, "d50": None, "stack": "Insufficient data"}
    last = closes[-1]
    d8 = _ema(closes, 8)[-1]
    d21 = _ema(closes, 21)[-1]
    d50 = _ema(closes, 50)[-1]

    if d8 is None or d21 is None or d50 is None:
        return {"d8": None, "d21": None, "d50": None, "stack": "Computing"}

    # Stacked Bullish = price > D8 > D21 > D50
    # Stacked Bearish = price < D8 < D21 < D50
    if last > d8 > d21 > d50:
        stack = "Stacked Bullish"
        verdict = "bullish"
    elif last < d8 < d21 < d50:
        stack = "Stacked Bearish"
        verdict = "bearish"
    elif last > d8 and last > d21 and last > d50:
        stack = "Above All EMAs"
        verdict = "bullish"
    elif last < d8 and last < d21 and last < d50:
        stack = "Below All EMAs"
        verdict = "bearish"
    else:
        stack = "Mixed / Choppy"
        verdict = "neutral"

    return {
        "d8": round(d8, 2),
        "d21": round(d21, 2),
        "d50": round(d50, 2),
        "stack": stack,
        "verdict": verdict,
        "last_close": round(last, 2),
        "vs_d8": round(last - d8, 2),
        "vs_d21": round(last - d21, 2),
        "vs_d50": round(last - d50, 2),
    }


def compute_daily_indicators(ticker: str = "SPY") -> dict:
    """Pull recent daily bars and compute all indicators."""
    if yf is None:
        return {"error": "yfinance not installed"}
    try:
        hist = yf.Ticker(ticker).history(period="6mo", interval="1d")
        if hist.empty:
            return {"error": "no history"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}

    closes = [float(x) for x in hist["Close"].tolist()]
    highs = [float(x) for x in hist["High"].tolist()]
    lows = [float(x) for x in hist["Low"].tolist()]
    if len(closes) < 30:
        return {"error": "insufficient history"}

    last_close = closes[-1]

    sma9 = _sma(closes, 9)[-1]
    sma20 = _sma(closes, 20)[-1]
    sma50 = _sma(closes, 50)[-1]
    ema9 = _ema(closes, 9)[-1]
    ema20 = _ema(closes, 20)[-1]
    ema50 = _ema(closes, 50)[-1]

    rsi = _rsi(closes, 14)
    macd = _macd(closes)
    atr = _atr(highs, lows, closes, 14)
    bb = _bbands(closes, 20, 2.0)
    stoch = _stoch(highs, lows, closes, 14, 3)

    # MA stack trend: above all = strong up, below all = strong down
    above = sum(
        1
        for m in (ema9, ema20, ema50)
        if m is not None and last_close > m
    )
    ma_trend = (
        "Strong Up"
        if above == 3
        else "Up" if above == 2
        else "Mixed" if above == 1
        else "Down"
    )

    stacked = _stacked_emas(closes)
    adx_data = _adx(highs, lows, closes, 14)

    # Intraday ADX (5-min bars over the last 5 days) — much more responsive
    # than the daily ADX during the trading session.
    adx_intraday = {"adx": None, "plus_di": None, "minus_di": None, "trend": None, "strength": None}
    try:
        intra = yf.Ticker(ticker).history(period="5d", interval="5m")
        if not intra.empty and len(intra) >= 30:
            ih = [float(x) for x in intra["High"].tolist()]
            il = [float(x) for x in intra["Low"].tolist()]
            ic = [float(x) for x in intra["Close"].tolist()]
            adx_intraday = _adx(ih, il, ic, 14)
    except Exception:
        pass

    # ---- Master Verdict ---------------------------------------------------
    # Synthesize all signals into a single BULLISH / BEARISH / MIXED verdict
    # + a GO / WAIT / NO-GO label inspired by TOS's "Stacked EMA / WAIT" banner.
    score = 0     # positive = bullish lean, negative = bearish lean
    factors = []

    # 1. Stacked EMAs (heaviest weight — primary trend)
    if stacked["verdict"] == "bullish":
        score += 2; factors.append("EMAs bullish-stacked")
    elif stacked["verdict"] == "bearish":
        score -= 2; factors.append("EMAs bearish-stacked")
    else:
        factors.append("EMAs mixed")

    # 2. RSI position
    if rsi is not None:
        if rsi >= 70:
            score -= 1; factors.append("RSI overbought (bearish reversion risk)")
        elif rsi <= 30:
            score += 1; factors.append("RSI oversold (bullish reversion setup)")
        elif rsi >= 55:
            score += 1; factors.append(f"RSI strong ({rsi})")
        elif rsi <= 45:
            score -= 1; factors.append(f"RSI weak ({rsi})")

    # 3. MACD trend
    if macd.get("trend") == "bullish":
        score += 1; factors.append("MACD histogram positive")
    elif macd.get("trend") == "bearish":
        score -= 1; factors.append("MACD histogram negative")

    # 4. ADX strength (does NOT vote direction — just amplifies the call)
    adx_v = adx_data.get("adx")
    if adx_v and adx_v >= 25 and adx_data.get("trend") == "Bullish":
        score += 1; factors.append(f"ADX {adx_v} (strong bullish trend)")
    elif adx_v and adx_v >= 25 and adx_data.get("trend") == "Bearish":
        score -= 1; factors.append(f"ADX {adx_v} (strong bearish trend)")

    if score >= 3:
        verdict = "BULLISH"; signal = "GO LONG"
    elif score <= -3:
        verdict = "BEARISH"; signal = "GO SHORT"
    elif score >= 1:
        verdict = "LEAN BULLISH"; signal = "WAIT"
    elif score <= -1:
        verdict = "LEAN BEARISH"; signal = "WAIT"
    else:
        verdict = "MIXED"; signal = "NO-GO"

    return {
        "last_close": round(last_close, 2),
        "stacked_emas": stacked,
        "adx": adx_data,
        "adx_intraday": adx_intraday,
        "master": {
            "verdict": verdict,
            "signal": signal,
            "score": score,
            "factors": factors,
        },
        "trailing": {
            "ema9": round(ema9, 2) if ema9 else None,
            "ema20": round(ema20, 2) if ema20 else None,
            "ema50": round(ema50, 2) if ema50 else None,
            "sma9": round(sma9, 2) if sma9 else None,
            "sma20": round(sma20, 2) if sma20 else None,
            "sma50": round(sma50, 2) if sma50 else None,
            "atr14": atr,
            "bb": bb,
            "ma_trend": ma_trend,
        },
        "leading": {
            "rsi14": rsi,
            "rsi_signal": _signal_label(rsi, 30, 70),
            "macd": macd,
            "stoch": stoch,
            "stoch_signal": _signal_label(stoch.get("k"), 20, 80),
        },
    }
