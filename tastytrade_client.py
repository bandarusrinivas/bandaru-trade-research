"""TastyTrade API client — free real-time SPY data with a funded brokerage account.

Auth flow (session-based):
    POST /sessions  with body {"login": <username>, "password": <password>}
    → response includes "session-token" — used as Authorization header on every
      subsequent request (note: NO 'Bearer' prefix; raw token).

For previous-day OHLC we fall back to yfinance — TastyTrade's REST API doesn't
have a clean equity-historical endpoint, and yesterday's bar isn't time-sensitive
so the delay doesn't matter for pivot calculation.

Docs: https://developer.tastytrade.com
"""
from __future__ import annotations

import math
import os
from datetime import datetime, timedelta

import pytz
import requests

BASE_URL = "https://api.tastyworks.com"  # note: kept the tastyworks hostname after rebrand


class TastyTradeClient:
    """Drop-in replacement for SchwabClient using TastyTrade's REST API."""

    def __init__(
        self,
        username: str | None = None,
        password: str | None = None,
        timeout: int = 15,
    ):
        self.username = username or os.environ.get("TASTYTRADE_USERNAME")
        self.password = password or os.environ.get("TASTYTRADE_PASSWORD")
        if not (self.username and self.password):
            raise ValueError(
                "TASTYTRADE_USERNAME and TASTYTRADE_PASSWORD must be set in .env. "
                "Sign up at https://my.tastytrade.com/sign-up first."
            )
        self.token_path = "(TastyTrade session)"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {"Accept": "application/json", "Content-Type": "application/json"}
        )
        self._session_token: str | None = None
        self._login()

    # --- auth ------------------------------------------------------------
    def _login(self) -> None:
        r = self.session.post(
            f"{BASE_URL}/sessions",
            json={"login": self.username, "password": self.password},
            timeout=self.timeout,
        )
        if r.status_code == 401:
            raise RuntimeError(
                "401 from TastyTrade — your username or password in .env is wrong. "
                "Note: it's your tastytrade.com login, not an API key."
            )
        r.raise_for_status()
        data = (r.json() or {}).get("data", {}) or {}
        self._session_token = data.get("session-token")
        if not self._session_token:
            raise RuntimeError(
                "TastyTrade login succeeded but returned no session-token. "
                "Check API response format."
            )
        self.session.headers["Authorization"] = self._session_token

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{BASE_URL}{path}"
        r = self.session.get(url, params=params or {}, timeout=self.timeout)
        if r.status_code == 401:
            # Session likely expired — log in again and retry once
            self._login()
            r = self.session.get(url, params=params or {}, timeout=self.timeout)
        r.raise_for_status()
        return r.json() or {}

    # --- helpers ---------------------------------------------------------
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
            return int(float(value))
        except (TypeError, ValueError):
            return None

    # --- equities --------------------------------------------------------
    def get_current_quote(self, ticker: str = "SPY") -> dict:
        payload = self._get(f"/market-data/{ticker}")
        data = payload.get("data", {}) or {}

        last = self._as_float(data.get("last"))
        mark = self._as_float(data.get("mark"))
        bid = self._as_float(data.get("bid"))
        ask = self._as_float(data.get("ask"))
        price = last or mark or ((bid + ask) / 2 if (bid and ask) else None)

        day_open = self._as_float(data.get("open"))
        day_high = self._as_float(data.get("day-high-price") or data.get("day-high"))
        day_low = self._as_float(data.get("day-low-price") or data.get("day-low"))
        day_volume = self._as_int(data.get("volume"))

        prev_close = self._as_float(
            data.get("prev-close") or data.get("previous-close") or data.get("close-price")
        )
        change = (price - prev_close) if (price is not None and prev_close is not None) else None
        change_pct = (change / prev_close * 100) if (change is not None and prev_close) else None

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
        # TastyTrade REST doesn't have a clean equity historical endpoint we can rely on.
        # Yesterday's OHLC is not time-sensitive, so fall back to yfinance (no auth).
        import yfinance as yf

        tick = yf.Ticker(ticker)
        hist = tick.history(period="10d", interval="1d")
        if hist.empty:
            raise RuntimeError("Could not get previous-day OHLC (yfinance fallback failed).")

        et = pytz.timezone("America/New_York")
        today = datetime.now(et).date()
        prev = None
        for idx, row in hist.iloc[::-1].iterrows():
            try:
                bar_date = idx.to_pydatetime().astimezone(et).date()
            except Exception:
                bar_date = idx.to_pydatetime().date()
            if bar_date < today:
                prev = (bar_date, row)
                break
        if prev is None:
            bar_date = hist.index[-1].to_pydatetime().date()
            row = hist.iloc[-1]
            prev = (bar_date, row)

        bar_date, row = prev
        return {
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]),
            "timestamp": int(
                datetime.combine(bar_date, datetime.min.time()).timestamp() * 1000
            ),
        }

    def get_today_intraday(self, ticker: str = "SPY", frequency: int = 5) -> list[dict]:
        return []  # not used by main dashboard

    # --- options ---------------------------------------------------------
    def _market_data_batch(self, symbols: list[str]) -> dict[str, dict]:
        """Bulk-quote multiple option symbols via /market-data?symbols=A,B,C..."""
        results: dict[str, dict] = {}
        # TT caps batch size; keep batches small to be safe
        BATCH = 50
        for i in range(0, len(symbols), BATCH):
            batch = symbols[i : i + BATCH]
            try:
                payload = self._get(
                    "/market-data",
                    params={"symbols": ",".join(batch)},
                )
            except Exception:
                continue
            data = payload.get("data", {}) or {}
            items = data.get("items") if isinstance(data, dict) else None
            if isinstance(items, list):
                for it in items:
                    sym = it.get("symbol")
                    if sym:
                        results[sym] = it
            elif isinstance(data, list):
                for it in data:
                    sym = it.get("symbol")
                    if sym:
                        results[sym] = it
        return results

    def get_options_chain(
        self,
        underlying: str = "SPY",
        expiration_date: str | None = None,
        strike_count: int = 40,
    ) -> dict:
        et = pytz.timezone("America/New_York")
        target = expiration_date or datetime.now(et).strftime("%Y-%m-%d")

        payload = self._get(f"/option-chains/{underlying}/nested")
        chain_root = payload.get("data", {}) or {}
        items = chain_root.get("items") or []
        if not items:
            return {"underlying_price": None, "contracts": []}

        item = items[0]  # SPY has one entry
        expirations = item.get("expirations") or []

        target_exp = None
        for exp in expirations:
            if (exp.get("expiration-date") or "").startswith(target[:10]):
                target_exp = exp
                break
        if not target_exp and expirations:
            # Pick the earliest expiration if today's isn't there (e.g. weekend)
            target_exp = sorted(
                expirations, key=lambda e: e.get("expiration-date") or ""
            )[0]
        if not target_exp:
            return {"underlying_price": None, "contracts": []}

        strikes = target_exp.get("strikes") or []

        # Current SPY price to find ATM strikes
        try:
            quote = self.get_current_quote(underlying)
            spy = quote["price"]
        except Exception:
            spy = None

        # Restrict to strike_count strikes around ATM (before fetching market data)
        if spy and strikes:
            strikes_sorted = sorted(
                strikes, key=lambda s: abs(float(s.get("strike-price") or 0) - spy)
            )[:strike_count]
        else:
            strikes_sorted = strikes[: strike_count or 40]

        # Collect option symbols (TT uses "call" / "put" or "call-streamer-symbol" / "put-streamer-symbol")
        symbols: list[str] = []
        symbol_map: dict[str, tuple[float, str]] = {}  # symbol → (strike, kind)
        for s in strikes_sorted:
            strike = self._as_float(s.get("strike-price"))
            if strike is None:
                continue
            for kind, key in (("call", "call"), ("put", "put")):
                sym = s.get(key)
                if sym:
                    symbols.append(sym)
                    symbol_map[sym] = (strike, kind)

        # Bulk fetch quotes for all option symbols
        quotes = self._market_data_batch(symbols)

        contracts: list[dict] = []
        for sym, (strike, kind) in symbol_map.items():
            md = quotes.get(sym, {})
            bid = self._as_float(md.get("bid")) or 0.0
            ask = self._as_float(md.get("ask")) or 0.0
            last = self._as_float(md.get("last"))
            mark = self._as_float(md.get("mark"))
            mid = mark if mark is not None else ((bid + ask) / 2 if (bid and ask) else (last or 0.0))
            iv = self._as_float(md.get("implied-volatility") or md.get("iv"))
            if iv is not None and iv < 5:
                iv = iv * 100
            delta = self._as_float(md.get("delta"))
            if delta is None and spy is not None:
                # fallback approximation
                if kind == "call":
                    delta = 1 / (1 + math.exp(-(spy - strike) / 1.5))
                else:
                    delta = -(1 / (1 + math.exp((spy - strike) / 1.5)))

            contracts.append(
                {
                    "ticker": sym,
                    "type": kind,
                    "strike": strike,
                    "bid": round(bid, 2),
                    "ask": round(ask, 2),
                    "mid": round(mid, 2),
                    "last": round(last, 2) if last is not None else None,
                    "mark": round(mid, 2),
                    "volume": self._as_int(md.get("volume")) or 0,
                    "open_interest": self._as_int(md.get("open-interest")) or 0,
                    "iv": round(iv, 2) if iv is not None else None,
                    "delta": round(delta, 3) if delta is not None else None,
                    "gamma": self._as_float(md.get("gamma")),
                    "theta": self._as_float(md.get("theta")),
                    "vega": self._as_float(md.get("vega")),
                }
            )

        return {"underlying_price": spy, "contracts": contracts}
