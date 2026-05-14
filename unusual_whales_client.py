"""Unusual Whales API client — real-time SPY quote + 0DTE options chain.

Endpoints used (from https://api.unusualwhales.com/docs):
  GET /api/stock/{ticker}/stock-state                 → real-time quote
  GET /api/stock/{ticker}/ohlc/{candle_size}          → daily OHLC for pivots
  GET /api/stock/{ticker}/option-chains               → 0DTE option chain
  GET /api/stock/{ticker}/greeks                      → per-contract greeks

Required headers (per the official skill.md):
    Authorization: Bearer <UNUSUAL_WHALES_API_KEY>
    UW-CLIENT-API-ID: 100001
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

import pytz
import requests

BASE_URL = "https://api.unusualwhales.com"


class UnusualWhalesClient:
    """Drop-in replacement for SchwabClient using Unusual Whales' REST API."""

    def __init__(
        self,
        api_key: str | None = None,
        client_id: str | None = None,
        timeout: int = 15,
    ):
        self.api_key = api_key or os.environ.get("UNUSUAL_WHALES_API_KEY")
        self.client_id = client_id or os.environ.get("UW_CLIENT_API_ID", "100001")
        if not self.api_key:
            raise ValueError(
                "UNUSUAL_WHALES_API_KEY not set. Add it to .env. "
                "Get a token at https://unusualwhales.com (account → API)."
            )
        self.token_path = "(Unusual Whales API)"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "UW-CLIENT-API-ID": self.client_id,
                "Accept": "application/json",
            }
        )

    # --- internals -------------------------------------------------------
    def _get(self, path: str, params: dict | None = None) -> dict:
        r = self.session.get(f"{BASE_URL}{path}", params=params or {}, timeout=self.timeout)
        if r.status_code == 401:
            raise RuntimeError(
                "401 from Unusual Whales — your API key is invalid or expired. "
                "Check UNUSUAL_WHALES_API_KEY in .env."
            )
        if r.status_code == 402 or r.status_code == 403:
            raise RuntimeError(
                f"{r.status_code} from Unusual Whales — your plan doesn't include "
                f"this endpoint, or you've hit a rate limit. ({path})"
            )
        r.raise_for_status()
        return r.json()

    @staticmethod
    def _as_float(value):
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_int(value):
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _first(d: dict, *keys, default=None):
        """Pick the first present non-None value from a list of keys."""
        for k in keys:
            if k in d and d[k] is not None:
                return d[k]
        return default

    # --- equities --------------------------------------------------------
    def get_current_quote(self, ticker: str = "SPY") -> dict:
        payload = self._get(f"/api/stock/{ticker}/stock-state")
        node = payload.get("data") if isinstance(payload, dict) else payload
        # API may return a single dict or a list
        if isinstance(node, list):
            node = node[0] if node else {}
        if not isinstance(node, dict):
            node = {}

        price = self._as_float(
            self._first(node, "last", "price", "last_price", "close", "mark", "regular_price")
        )
        prev_close = self._as_float(
            self._first(node, "prev_close", "previous_close", "yesterday_close")
        )
        day_open = self._as_float(self._first(node, "open", "day_open"))
        day_high = self._as_float(self._first(node, "high", "day_high"))
        day_low = self._as_float(self._first(node, "low", "day_low"))
        day_volume = self._as_int(self._first(node, "volume", "total_volume", "day_volume"))

        change = self._as_float(self._first(node, "change", "net_change"))
        change_pct = self._as_float(self._first(node, "change_percent", "percent_change", "change_pct"))
        if change is None and price is not None and prev_close is not None:
            change = price - prev_close
        if change_pct is None and change is not None and prev_close:
            change_pct = change / prev_close * 100

        return {
            "price": price,
            "day_open": day_open,
            "day_high": day_high,
            "day_low": day_low,
            "day_volume": day_volume,
            "change": round(change, 2) if change is not None else None,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
        }

    def get_previous_day(self, ticker: str = "SPY") -> dict:
        # Use daily OHLC, ask for several days, pick yesterday.
        et = pytz.timezone("America/New_York")
        end_date = datetime.now(et).date()
        start_date = end_date - timedelta(days=14)
        payload = self._get(
            f"/api/stock/{ticker}/ohlc/1d",
            params={
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
            },
        )
        candles = payload.get("data") if isinstance(payload, dict) else payload
        if not isinstance(candles, list) or not candles:
            raise RuntimeError("Unusual Whales returned no daily OHLC candles.")

        today_str = end_date.strftime("%Y-%m-%d")
        prev = None
        for c in reversed(candles):
            ts = self._first(c, "date", "start_time", "timestamp", "start", "datetime")
            ts_str = str(ts)[:10] if ts else None
            if ts_str and ts_str < today_str:
                prev = c
                break
        if prev is None:
            prev = candles[-1]

        return {
            "open": self._as_float(self._first(prev, "open")) or 0.0,
            "high": self._as_float(self._first(prev, "high")) or 0.0,
            "low": self._as_float(self._first(prev, "low")) or 0.0,
            "close": self._as_float(self._first(prev, "close")) or 0.0,
            "volume": self._as_int(self._first(prev, "volume", "total_volume")) or 0,
            "timestamp": self._first(prev, "date", "start_time", "timestamp", "start"),
        }

    def get_today_intraday(self, ticker: str = "SPY", frequency: int = 5) -> list[dict]:
        # Intraday OHLC via the same endpoint with smaller candle size
        candle = "5m" if frequency == 5 else "1m"
        try:
            payload = self._get(f"/api/stock/{ticker}/ohlc/{candle}")
        except Exception:
            return []
        bars = payload.get("data") if isinstance(payload, dict) else payload
        return bars if isinstance(bars, list) else []

    # --- options ---------------------------------------------------------
    def get_options_chain(
        self,
        underlying: str = "SPY",
        expiration_date: str | None = None,
        strike_count: int = 40,
    ) -> dict:
        et = pytz.timezone("America/New_York")
        target = expiration_date or datetime.now(et).strftime("%Y-%m-%d")

        # Try option-chains first; fall back to atm-chains if needed.
        try:
            payload = self._get(
                f"/api/stock/{underlying}/option-chains",
                params={"expiry": target},
            )
        except requests.HTTPError:
            payload = self._get(f"/api/stock/{underlying}/atm-chains")

        rows = payload.get("data") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            rows = []

        # Find current SPY price for ATM filtering
        try:
            spy = self.get_current_quote(underlying)["price"]
        except Exception:
            spy = None

        contracts: list[dict] = []
        for r in rows:
            if not isinstance(r, dict):
                continue
            strike = self._as_float(self._first(r, "strike", "strike_price"))
            kind = self._first(r, "side", "type", "option_type", "call_put")
            if isinstance(kind, str):
                kind = kind.lower()
                if kind in ("c", "calls"):
                    kind = "call"
                elif kind in ("p", "puts"):
                    kind = "put"
            expiry = str(self._first(r, "expiry", "expiration_date", "expires", "exp")) [:10]
            if strike is None or kind not in ("call", "put"):
                continue
            # Respect the expiration filter even if the API ignored ours
            if expiry and expiry != target[:10]:
                continue

            bid = self._as_float(self._first(r, "bid", "bid_price")) or 0.0
            ask = self._as_float(self._first(r, "ask", "ask_price")) or 0.0
            last = self._as_float(self._first(r, "last", "last_price", "close"))
            mid_field = self._as_float(self._first(r, "mid", "mark", "mid_price", "mark_price"))
            if mid_field is not None:
                mid = mid_field
            elif bid and ask:
                mid = (bid + ask) / 2
            else:
                mid = last or 0.0
            iv_raw = self._as_float(
                self._first(r, "implied_volatility", "iv", "implied_vol")
            )
            iv = iv_raw * 100 if iv_raw is not None and iv_raw < 5 else iv_raw

            contracts.append(
                {
                    "ticker": self._first(r, "option_symbol", "symbol", "contract_symbol"),
                    "type": kind,
                    "strike": strike,
                    "bid": round(bid, 2),
                    "ask": round(ask, 2),
                    "mid": round(mid, 2),
                    "last": round(last, 2) if last is not None else None,
                    "mark": round(mid, 2),
                    "volume": self._as_int(self._first(r, "volume", "total_volume")) or 0,
                    "open_interest": self._as_int(self._first(r, "open_interest", "oi")) or 0,
                    "iv": round(iv, 2) if iv is not None else None,
                    "delta": self._as_float(self._first(r, "delta")),
                    "gamma": self._as_float(self._first(r, "gamma")),
                    "theta": self._as_float(self._first(r, "theta")),
                    "vega": self._as_float(self._first(r, "vega")),
                }
            )

        # Restrict to strike_count strikes around ATM (calls + puts at each)
        if spy and contracts:
            strikes_sorted = sorted(
                set(c["strike"] for c in contracts), key=lambda s: abs(s - spy)
            )[:strike_count]
            keep = set(strikes_sorted)
            contracts = [c for c in contracts if c["strike"] in keep]

        return {"underlying_price": spy, "contracts": contracts}
