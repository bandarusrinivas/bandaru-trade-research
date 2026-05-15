"""Schwab Developer API client for SPY price + options chain data.

Uses the schwab-py library (https://github.com/alexgolec/schwab-py) which
handles the OAuth 2.0 flow and token refresh. Run schwab_setup.py once to
complete the initial browser-based authorization.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

import pytz
from schwab.auth import client_from_manual_flow, client_from_token_file

DEFAULT_TOKEN_PATH = os.path.join(os.path.dirname(__file__), "schwab_token.json")


class SchwabClient:
    """Thin wrapper around schwab-py exposing only what the dashboard needs."""

    def __init__(
        self,
        api_key: str | None = None,
        app_secret: str | None = None,
        callback_url: str | None = None,
        token_path: str | None = None,
        interactive: bool = False,
    ):
        self.api_key = api_key or os.environ.get("SCHWAB_API_KEY")
        self.app_secret = app_secret or os.environ.get("SCHWAB_APP_SECRET")
        self.callback_url = (
            callback_url
            or os.environ.get("SCHWAB_CALLBACK_URL", "https://127.0.0.1")
        )
        self.token_path = (
            token_path or os.environ.get("SCHWAB_TOKEN_PATH", DEFAULT_TOKEN_PATH)
        )

        if not (self.api_key and self.app_secret):
            raise ValueError(
                "SCHWAB_API_KEY and SCHWAB_APP_SECRET must be set in .env"
            )

        if os.path.exists(self.token_path):
            self.client = client_from_token_file(
                token_path=self.token_path,
                api_key=self.api_key,
                app_secret=self.app_secret,
            )
        elif interactive:
            # Manual flow — works with port-less callbacks like https://127.0.0.1
            # (easy_client / client_from_login_flow require a port in the URL
            # because they spin up a local HTTPS listener). With manual flow,
            # schwab-py prints a Schwab auth URL, the user logs in, then
            # pastes the redirect URL back into the terminal.
            self.client = client_from_manual_flow(
                api_key=self.api_key,
                app_secret=self.app_secret,
                callback_url=self.callback_url,
                token_path=self.token_path,
            )
        else:
            raise RuntimeError(
                f"No Schwab token at {self.token_path}. "
                "Run `python schwab_setup.py` first to authorize."
            )

    def get_current_quote(self, ticker: str = "SPY") -> dict:
        resp = self.client.get_quote(ticker)
        resp.raise_for_status()
        data = resp.json() or {}
        node = data.get(ticker, {}) or {}
        q = node.get("quote", {}) or {}
        reg = node.get("regular", {}) or {}
        price = (
            q.get("lastPrice")
            or q.get("mark")
            or reg.get("regularMarketLastPrice")
        )
        return {
            "price": price,
            "day_open": q.get("openPrice"),
            "day_high": q.get("highPrice"),
            "day_low": q.get("lowPrice"),
            "day_volume": q.get("totalVolume"),
            "change": q.get("netChange"),
            "change_pct": q.get("netPercentChange"),
        }

    def get_previous_day(self, ticker: str = "SPY") -> dict:
        et = pytz.timezone("America/New_York")
        end_dt = datetime.now(et)
        start_dt = end_dt - timedelta(days=14)
        resp = self.client.get_price_history_every_day(
            ticker,
            start_datetime=start_dt,
            end_datetime=end_dt,
        )
        resp.raise_for_status()
        candles = (resp.json() or {}).get("candles", []) or []
        if not candles:
            raise RuntimeError("No price history returned by Schwab.")
        today_str = end_dt.strftime("%Y-%m-%d")
        prev = None
        for c in reversed(candles):
            c_date = datetime.fromtimestamp(c["datetime"] / 1000, tz=et).strftime(
                "%Y-%m-%d"
            )
            if c_date < today_str:
                prev = c
                break
        if not prev:
            raise RuntimeError("Could not find a previous-day candle.")
        return {
            "open": prev["open"],
            "high": prev["high"],
            "low": prev["low"],
            "close": prev["close"],
            "volume": prev["volume"],
            "timestamp": prev["datetime"],
        }

    def get_today_intraday(
        self, ticker: str = "SPY", frequency: int = 5
    ) -> list[dict]:
        et = pytz.timezone("America/New_York")
        end_dt = datetime.now(et)
        start_dt = end_dt.replace(hour=4, minute=0, second=0, microsecond=0)
        resp = self.client.get_price_history_every_minute(
            ticker,
            start_datetime=start_dt,
            end_datetime=end_dt,
            frequency=frequency,
        )
        resp.raise_for_status()
        return (resp.json() or {}).get("candles", []) or []

    def get_options_chain(
        self,
        underlying: str = "SPY",
        expiration_date: str | None = None,
        strike_count: int = 40,
    ) -> dict:
        et = pytz.timezone("America/New_York")
        if expiration_date:
            exp_dt = datetime.strptime(expiration_date, "%Y-%m-%d").date()
        else:
            exp_dt = datetime.now(et).date()

        resp = self.client.get_option_chain(
            underlying,
            contract_type=self.client.Options.ContractType.ALL,
            from_date=exp_dt,
            to_date=exp_dt,
            strike_count=strike_count,
        )
        resp.raise_for_status()
        data = resp.json() or {}

        underlying_price = data.get("underlyingPrice")
        flat: list[dict] = []
        for map_key in ("callExpDateMap", "putExpDateMap"):
            exp_map = data.get(map_key, {}) or {}
            for _exp_str, strikes in exp_map.items():
                for strike_str, contracts in strikes.items():
                    try:
                        strike = float(strike_str)
                    except ValueError:
                        continue
                    for c in contracts:
                        bid = c.get("bid") or 0
                        ask = c.get("ask") or 0
                        mark = c.get("mark") or 0
                        if bid and ask:
                            mid = (bid + ask) / 2
                        else:
                            mid = mark or c.get("last") or 0
                        flat.append(
                            {
                                "ticker": c.get("symbol"),
                                "type": (c.get("putCall") or "").lower(),
                                "strike": strike,
                                "bid": bid,
                                "ask": ask,
                                "mid": round(mid, 2),
                                "last": c.get("last"),
                                "mark": mark,
                                "volume": c.get("totalVolume") or 0,
                                "open_interest": c.get("openInterest") or 0,
                                "iv": c.get("volatility"),
                                "delta": c.get("delta"),
                                "gamma": c.get("gamma"),
                                "theta": c.get("theta"),
                                "vega": c.get("vega"),
                            }
                        )
        return {"underlying_price": underlying_price, "contracts": flat}
