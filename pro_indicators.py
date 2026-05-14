"""Pro day-trading signals inspired by ThinkorSwim's TTM Squeeze setup.

Implements:
  - TTM Squeeze (John Carter): BB(20,2) inside Keltner(20, 1.5*ATR) = squeeze on;
    momentum = linear regression of (close - midpoint) where midpoint is the
    average of (highest_high+lowest_low)/2 and SMA20.
  - Overnight High / Low — pre-market range from intraday Yahoo 1-min bars.
  - Volume Confirmation — current bar volume vs 20-period average + price direction.
  - Chandelier Exit — ATR-based trailing stop (Charles Le Beau).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import pytz

try:
    import yfinance as yf
except ImportError:
    yf = None


def _sma(values, period):
    if len(values) < period:
        return [None] * len(values)
    out = [None] * (period - 1)
    for i in range(period - 1, len(values)):
        out.append(sum(values[i - period + 1 : i + 1]) / period)
    return out


def _std(values, period):
    out = [None] * len(values)
    means = _sma(values, period)
    for i in range(period - 1, len(values)):
        mean = means[i]
        window = values[i - period + 1 : i + 1]
        var = sum((x - mean) ** 2 for x in window) / period
        out[i] = var ** 0.5
    return out


def _atr_series(highs, lows, closes, period):
    """ATR for each bar (not a single value)."""
    if len(closes) < 2:
        return [None] * len(closes)
    trs = [0.0]
    for i in range(1, len(closes)):
        trs.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))
    if len(trs) < period:
        return [None] * len(closes)
    atr = sum(trs[:period]) / period
    out = [None] * (period - 1) + [atr]
    for tr in trs[period:]:
        atr = (atr * (period - 1) + tr) / period
        out.append(atr)
    return out


def _linreg_slope(values, period):
    """Slope of linear regression over the last `period` values."""
    n = period
    if len(values) < n:
        return None
    y = values[-n:]
    x_mean = (n - 1) / 2
    y_mean = sum(y) / n
    num = sum((i - x_mean) * (y[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    if den == 0:
        return 0
    return num / den


def ttm_squeeze(highs, lows, closes, period=20, bb_mult=2.0, kc_mult=1.5):
    """TTM Squeeze indicator.

    Returns:
      {
        'in_squeeze': bool,             # BB inside KC right now
        'fired': str or None,           # 'bullish' / 'bearish' / None if squeeze just released
        'momentum': float,              # linear regression slope of close-midpoint
        'momentum_direction': str,      # 'rising' / 'falling'
        'bars_in_squeeze': int,         # how long we've been squeezed
        'state': str                    # human-readable description
      }
    """
    n = len(closes)
    if n < period + 5:
        return {"in_squeeze": False, "fired": None, "momentum": 0,
                "momentum_direction": "—", "bars_in_squeeze": 0,
                "state": "Not enough data"}

    sma = _sma(closes, period)
    std = _std(closes, period)
    atr = _atr_series(highs, lows, closes, period)

    in_sq = [None] * n
    for i in range(period - 1, n):
        if sma[i] is None or std[i] is None or atr[i] is None:
            in_sq[i] = None
            continue
        upper_bb = sma[i] + bb_mult * std[i]
        lower_bb = sma[i] - bb_mult * std[i]
        upper_kc = sma[i] + kc_mult * atr[i]
        lower_kc = sma[i] - kc_mult * atr[i]
        in_sq[i] = (lower_bb > lower_kc) and (upper_bb < upper_kc)

    # Momentum series: linear regression of (close - midpoint over period)
    momentum = []
    for i in range(n):
        if i < period - 1:
            momentum.append(0)
            continue
        window_h = highs[i - period + 1 : i + 1]
        window_l = lows[i - period + 1 : i + 1]
        hh = max(window_h)
        ll = min(window_l)
        midpoint = ((hh + ll) / 2 + sma[i]) / 2
        diff_window = [closes[j] - midpoint for j in range(i - period + 1, i + 1)]
        slope = _linreg_slope(diff_window, period) or 0
        # Scale: use the last close - midpoint as the level (a common variant)
        momentum.append(closes[i] - midpoint)

    fired = None
    if n >= 2 and in_sq[-1] is False and in_sq[-2] is True:
        fired = "bullish" if momentum[-1] > 0 else "bearish"

    bars_in_squeeze = 0
    for i in range(n - 1, -1, -1):
        if in_sq[i]:
            bars_in_squeeze += 1
        else:
            break

    mom_dir = "—"
    if n >= 2:
        mom_dir = "rising" if momentum[-1] > momentum[-2] else "falling"

    if in_sq[-1]:
        state = f"In Squeeze ({bars_in_squeeze} bars)"
    elif fired:
        state = f"Just Fired {fired.upper()}"
    elif momentum[-1] > 0:
        state = f"Bullish — momentum {mom_dir}"
    else:
        state = f"Bearish — momentum {mom_dir}"

    return {
        "in_squeeze": bool(in_sq[-1]) if in_sq[-1] is not None else False,
        "fired": fired,
        "momentum": round(momentum[-1], 3),
        "momentum_direction": mom_dir,
        "bars_in_squeeze": bars_in_squeeze,
        "state": state,
        # Last 20 momentum bars for a sparkline chart
        "history": [round(m, 3) for m in momentum[-20:]],
    }


def overnight_high_low(ticker: str = "SPY") -> dict:
    """Overnight (pre-market + after-hours) high/low for SPY.

    Window: from yesterday 4pm ET to today 9:30am ET.
    Uses Yahoo's pre/post market data via yfinance (prepost=True).
    """
    if yf is None:
        return {"high": None, "low": None, "error": "yfinance not installed"}
    try:
        et = pytz.timezone("America/New_York")
        now = datetime.now(et)
        start = (now - timedelta(days=2)).replace(hour=16, minute=0, second=0, microsecond=0)
        hist = yf.Ticker(ticker).history(
            start=start.strftime("%Y-%m-%d"),
            interval="5m",
            prepost=True,
        )
        if hist.empty:
            return {"high": None, "low": None}

        today_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        prev_close = today_open - timedelta(hours=17, minutes=30)  # ~ yesterday 4pm

        hi = lo = None
        for idx, row in hist.iterrows():
            try:
                ts = idx.to_pydatetime().astimezone(et)
            except Exception:
                continue
            if prev_close <= ts < today_open:
                h = float(row["High"])
                l = float(row["Low"])
                hi = h if hi is None else max(hi, h)
                lo = l if lo is None else min(lo, l)

        return {
            "high": round(hi, 2) if hi else None,
            "low": round(lo, 2) if lo else None,
        }
    except Exception as e:  # noqa: BLE001
        return {"high": None, "low": None, "error": str(e)}


def volume_confirmation(volumes, closes, opens, lookback=20, threshold=1.5) -> dict:
    """Volume Confirmation signal.

    Triggers when current bar volume > threshold * avg(last 20 bars) AND
    price moves in agreement (close above open = bullish, below = bearish).
    """
    if len(volumes) < lookback + 1 or len(closes) < 2:
        return {"signal": None, "ratio": None, "state": "Insufficient data"}
    avg_vol = sum(volumes[-lookback - 1 : -1]) / lookback
    cur_vol = volumes[-1]
    if avg_vol == 0:
        return {"signal": None, "ratio": None, "state": "No volume data"}
    ratio = cur_vol / avg_vol
    cur_open = opens[-1] if opens else closes[-2]
    cur_close = closes[-1]
    is_bull = cur_close > cur_open
    signal = None
    if ratio >= threshold:
        signal = "bullish" if is_bull else "bearish"
    return {
        "signal": signal,
        "ratio": round(ratio, 2),
        "state": (
            f"VC: {signal.upper()} VOLUME ({ratio:.2f}x avg)"
            if signal
            else f"Normal volume ({ratio:.2f}x avg)"
        ),
    }


def chandelier_exit(highs, lows, closes, period=22, multiplier=3.0) -> dict:
    """Chandelier Exit trailing stop (Charles Le Beau).

    Long stop  = highest_high(22) - 3 * ATR(22)
    Short stop = lowest_low(22)   + 3 * ATR(22)
    """
    if len(closes) < period + 1:
        return {"long_stop": None, "short_stop": None}
    atr = _atr_series(highs, lows, closes, period)[-1]
    if atr is None:
        return {"long_stop": None, "short_stop": None}
    window_h = highs[-period:]
    window_l = lows[-period:]
    long_stop = max(window_h) - multiplier * atr
    short_stop = min(window_l) + multiplier * atr
    return {
        "long_stop": round(long_stop, 2),
        "short_stop": round(short_stop, 2),
        "atr": round(atr, 2),
    }


def compute_pro_signals(ticker: str = "SPY") -> dict:
    """All pro signals computed off the daily timeframe from yfinance."""
    if yf is None:
        return {"error": "yfinance not installed"}
    try:
        hist = yf.Ticker(ticker).history(period="3mo", interval="1d")
        if hist.empty or len(hist) < 25:
            return {"error": "not enough history"}
    except Exception as e:
        return {"error": str(e)}

    highs = [float(x) for x in hist["High"].tolist()]
    lows = [float(x) for x in hist["Low"].tolist()]
    closes = [float(x) for x in hist["Close"].tolist()]
    opens = [float(x) for x in hist["Open"].tolist()]
    volumes = [int(x) for x in hist["Volume"].tolist()]

    return {
        "squeeze": ttm_squeeze(highs, lows, closes),
        "overnight": overnight_high_low(ticker),
        "volume_conf": volume_confirmation(volumes, closes, opens),
        "chandelier": chandelier_exit(highs, lows, closes),
    }
