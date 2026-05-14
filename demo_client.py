"""Synthetic data provider — same interface as SchwabClient.

Used when DEMO_MODE=true in .env, so the dashboard can be previewed before
your real Schwab developer app is approved. Generates a realistic-looking
SPY quote, previous-day OHLC, and a 0DTE options chain tuned so all four
recommendation types (breakout / breakdown / bounce / rejection) fire.
"""
from __future__ import annotations

import math
import random
from datetime import datetime


# Prev-day OHLC chosen so pivots are spaced ~$1-2 apart:
#   PP = 580.60, R1 = 583.00, S1 = 578.70, R2 = 584.90, S2 = 576.30, R3 = 587.30, S3 = 574.40
PREV_HIGH = 582.50
PREV_LOW = 578.20
PREV_CLOSE = 581.10

# Current price chosen to sit just above PP (support) and below R1 (resistance),
# so the dashboard generates a bullish-bounce AND a bearish-rejection setup
# in addition to the always-on breakout/breakdown plays.
BASE_PRICE = 581.45


class DemoClient:
    """Drop-in replacement for SchwabClient that returns fake but plausible data."""

    def __init__(self, *args, **kwargs):
        self.token_path = "(demo mode — no token needed)"
        # Re-seed every 30s so the data drifts a bit between auto-refreshes
        random.seed(int(datetime.now().timestamp()) // 30)

    def _current_price(self) -> float:
        return round(BASE_PRICE + random.uniform(-0.35, 0.35), 2)

    # --- equities ----------------------------------------------------------
    def get_current_quote(self, ticker: str = "SPY") -> dict:
        price = self._current_price()
        change = price - PREV_CLOSE
        return {
            "price": price,
            "day_open": round(PREV_CLOSE - 0.15, 2),
            "day_high": round(price + 0.85, 2),
            "day_low": round(PREV_CLOSE - 1.0, 2),
            "day_volume": 38_400_000,
            "change": round(change, 2),
            "change_pct": round((change / PREV_CLOSE) * 100, 2),
        }

    def get_previous_day(self, ticker: str = "SPY") -> dict:
        return {
            "open": 580.20,
            "high": PREV_HIGH,
            "low": PREV_LOW,
            "close": PREV_CLOSE,
            "volume": 65_200_000,
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

    def get_today_intraday(self, ticker: str = "SPY", frequency: int = 5) -> list[dict]:
        return []  # not used by the current dashboard

    # --- options -----------------------------------------------------------
    def get_options_chain(
        self,
        underlying: str = "SPY",
        expiration_date: str | None = None,
        strike_count: int = 40,
    ) -> dict:
        spy = self._current_price()
        contracts: list[dict] = []
        # 20 strikes above + 20 below ATM, $1 increments
        lo = math.floor(spy) - 20
        hi = math.floor(spy) + 20
        for strike in range(lo, hi + 1):
            for kind in ("call", "put"):
                if kind == "call":
                    intrinsic = max(0.0, spy - strike)
                    delta = 1 / (1 + math.exp(-(spy - strike) / 1.5))
                else:
                    intrinsic = max(0.0, strike - spy)
                    delta = -(1 / (1 + math.exp((spy - strike) / 1.5)))

                otm = abs(spy - strike)
                # Tiny time value typical of 0DTE — decays sharply as you move OTM
                time_value = max(0.05, 0.40 * math.exp(-(otm ** 2) / 8))
                mid = round(intrinsic + time_value, 2)
                bid = round(max(0.01, mid - 0.02), 2)
                ask = round(mid + 0.02, 2)

                iv = round(13.0 + random.uniform(-1, 1) + otm * 0.4, 2)
                volume = max(50, int(2000 * math.exp(-otm / 4)))
                oi = max(100, int(5000 * math.exp(-otm / 5)))

                contracts.append(
                    {
                        "ticker": f"SPY_DEMO_{kind[0].upper()}{strike:04d}",
                        "type": kind,
                        "strike": float(strike),
                        "bid": bid,
                        "ask": ask,
                        "mid": mid,
                        "last": mid,
                        "mark": mid,
                        "volume": volume,
                        "open_interest": oi,
                        "iv": iv,
                        "delta": round(delta, 3),
                        "gamma": round(0.05 * math.exp(-otm / 3), 4),
                        "theta": round(-0.15 * math.exp(-otm / 4), 3),
                        "vega": round(0.02, 3),
                    }
                )
        return {"underlying_price": spy, "contracts": contracts}
