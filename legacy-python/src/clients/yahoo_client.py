"""Yahoo Finance data client (no auth required).

Pulls SPY quote, previous-day OHLC, and the 0DTE options chain via yfinance.
Quotes are typically ~15-min delayed during market hours. Good as a free
fallback while you wait for Schwab developer-app approval.
"""
from __future__ import annotations

import math
from datetime import datetime

import pytz
import yfinance as yf


class YahooClient:
    """Drop-in replacement for SchwabClient using free Yahoo Finance data.

    NOTE: yf.Ticker() is cheap (no network in constructor). We create one
    PER-CALL using the requested ticker so the client correctly switches
    when the user changes symbols. Previously we cached a SPY ticker
    which silently overrode every method.
    """

    def __init__(self, *args, **kwargs):
        self.token_path = "(Yahoo Finance — no auth)"
        # Per-ticker price cache so options-chain ATM filtering doesn't re-fetch
        self._cached_price: dict[str, float] = {}

    # --- helpers ---------------------------------------------------------
    def _tk(self, ticker: str):
        return yf.Ticker(ticker)

    def _fast_price(self, ticker: str) -> tuple[float, float | None]:
        """(last_price, previous_close) using fast_info, with history fallback."""
        t = self._tk(ticker)
        try:
            fi = t.fast_info
            price = float(getattr(fi, "last_price", None) or 0)
            prev_close = float(getattr(fi, "previous_close", None) or 0) or None
            if price:
                return price, prev_close
        except Exception:
            pass
        # Fallback: 1-day intraday + 5-day daily
        try:
            intra = t.history(period="1d", interval="1m")
            if not intra.empty:
                price = float(intra.iloc[-1]["Close"])
            else:
                daily = t.history(period="5d", interval="1d")
                price = float(daily.iloc[-1]["Close"])
            daily = t.history(period="5d", interval="1d")
            prev_close = float(daily.iloc[-2]["Close"]) if len(daily) >= 2 else None
            return price, prev_close
        except Exception as e:
            raise RuntimeError(f"Yahoo Finance returned no data for {ticker}: {e}") from e

    def _session_label(self) -> tuple[str, str]:
        """Return ('premarket' | 'regular' | 'afterhours' | 'closed', human-readable label)."""
        et = pytz.timezone("America/New_York")
        now = datetime.now(et)
        weekday = now.weekday()  # 0=Mon, 6=Sun
        # Weekend
        if weekday >= 5:
            return "closed", "Market Closed (weekend)"
        # Regular hours: 9:30 - 16:00 ET
        rth_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        rth_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
        pre_open = now.replace(hour=4, minute=0, second=0, microsecond=0)
        post_close = now.replace(hour=20, minute=0, second=0, microsecond=0)
        if pre_open <= now < rth_open:
            return "premarket", "Premarket (4:00–9:30 ET)"
        if rth_open <= now < rth_close:
            return "regular", "Regular Hours"
        if rth_close <= now < post_close:
            return "afterhours", "After-Hours (16:00–20:00 ET)"
        return "closed", "Market Closed (overnight)"

    def _session_price(self, ticker: str, session: str) -> dict:
        """Pull premarket/afterhours price from Yahoo's prepost intraday data."""
        if session not in ("premarket", "afterhours"):
            return {}
        try:
            t = self._tk(ticker)
            hist = t.history(period="1d", interval="1m", prepost=True)
            if hist.empty:
                return {}
            et = pytz.timezone("America/New_York")
            today = datetime.now(et).date()
            rth_open = datetime.now(et).replace(hour=9, minute=30, second=0, microsecond=0)
            rth_close = datetime.now(et).replace(hour=16, minute=0, second=0, microsecond=0)
            bars = []
            for idx, row in hist.iterrows():
                try:
                    ts = idx.to_pydatetime().astimezone(et)
                except Exception:
                    continue
                if ts.date() != today:
                    continue
                in_session = False
                if session == "premarket" and ts < rth_open:
                    in_session = True
                elif session == "afterhours" and ts >= rth_close:
                    in_session = True
                if in_session:
                    bars.append((ts, row))
            if not bars:
                return {}
            last_ts, last_bar = bars[-1]
            sess_high = max(float(b[1]["High"]) for b in bars)
            sess_low = min(float(b[1]["Low"]) for b in bars)
            sess_vol = int(sum(float(b[1]["Volume"]) for b in bars))
            return {
                "price": float(last_bar["Close"]),
                "high": round(sess_high, 2),
                "low": round(sess_low, 2),
                "volume": sess_vol,
                "last_update": last_ts.strftime("%H:%M ET"),
            }
        except Exception:
            return {}

    # --- equities --------------------------------------------------------
    def get_current_quote(self, ticker: str = "SPY") -> dict:
        t = self._tk(ticker)
        price, prev_close = self._fast_price(ticker)
        self._cached_price[ticker] = price
        try:
            fi = t.fast_info
            day_open = float(getattr(fi, "open", 0) or 0) or None
            day_high = float(getattr(fi, "day_high", 0) or 0) or None
            day_low = float(getattr(fi, "day_low", 0) or 0) or None
            day_volume = int(getattr(fi, "last_volume", 0) or 0) or None
        except Exception:
            day_open = day_high = day_low = day_volume = None

        # Detect session + fetch off-hours price if applicable
        session, session_label = self._session_label()
        session_data = self._session_price(ticker, session)
        # During pre/post hours, prefer the off-hours last trade for "current"
        if session in ("premarket", "afterhours") and session_data.get("price"):
            price = session_data["price"]

        change = (price - prev_close) if (price and prev_close) else None
        change_pct = (change / prev_close * 100) if (change is not None and prev_close) else None
        return {
            "price": price,
            "day_open": day_open,
            "day_high": day_high,
            "day_low": day_low,
            "day_volume": day_volume,
            "change": round(change, 2) if change is not None else None,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
            "session": session,                # 'premarket' | 'regular' | 'afterhours' | 'closed'
            "session_label": session_label,    # human-readable
            "session_data": session_data,      # premarket/afterhours H/L/V if applicable
        }

    def get_previous_day(self, ticker: str = "SPY") -> dict:
        hist = self._tk(ticker).history(period="10d", interval="1d")
        if hist.empty:
            raise RuntimeError(f"No daily history returned by Yahoo Finance for {ticker}.")
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
            # market hasn't opened yet today; use most recent bar
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
        return []

    # --- options ---------------------------------------------------------
    def get_options_chain(
        self,
        underlying: str = "SPY",
        expiration_date: str | None = None,
        strike_count: int = 40,
    ) -> dict:
        t = self._tk(underlying)
        # Yahoo occasionally returns empty options on the first call — retry once.
        expirations = list(t.options or [])
        if not expirations:
            t = self._tk(underlying)  # rebuild ticker
            expirations = list(t.options or [])
        print(f"[YAHOO] {underlying} expirations available: {expirations[:6]}{'...' if len(expirations) > 6 else ''}", flush=True)
        if not expirations:
            return {"underlying_price": None, "contracts": []}

        # Pick: requested date if available, else the NEAREST expiration ≥ requested.
        target = expiration_date if expiration_date in expirations else None
        if target is None:
            if expiration_date:
                future = [e for e in expirations if e >= expiration_date]
                target = future[0] if future else expirations[0]
            else:
                target = expirations[0]
        print(f"[YAHOO] {underlying} fetching chain for {target}", flush=True)

        try:
            chain = t.option_chain(target)
        except Exception as e:
            print(f"[YAHOO] option_chain({target}) failed: {type(e).__name__}: {e}; trying next expiration", flush=True)
            # Try the very next expiration as a fallback
            others = [e for e in expirations if e != target]
            if not others:
                raise
            target = others[0]
            chain = t.option_chain(target)

        calls_df = chain.calls
        puts_df = chain.puts

        spy = self._cached_price.get(underlying) or self._fast_price(underlying)[0]

        # Restrict to strike_count strikes around ATM
        all_strikes = sorted(
            set(calls_df["strike"].tolist() + puts_df["strike"].tolist())
        )
        if all_strikes and spy:
            sorted_by_dist = sorted(all_strikes, key=lambda s: abs(s - spy))
            keep = set(sorted_by_dist[:strike_count])
            calls_df = calls_df[calls_df["strike"].isin(keep)]
            puts_df = puts_df[puts_df["strike"].isin(keep)]

        def _safe_float(val, default=0.0):
            """Convert to float, treating NaN/None as default."""
            try:
                f = float(val) if val is not None else default
                if math.isnan(f):
                    return default
                return f
            except (TypeError, ValueError):
                return default

        def _safe_int(val, default=0):
            """Convert to int, safely handling NaN (Yahoo's pandas frames are full of these)."""
            try:
                f = float(val) if val is not None else default
                if math.isnan(f):
                    return default
                return int(f)
            except (TypeError, ValueError):
                return default

        contracts: list[dict] = []
        for df, kind in [(calls_df, "call"), (puts_df, "put")]:
            for _, row in df.iterrows():
                strike = _safe_float(row.get("strike"))
                if not strike:
                    continue  # skip rows with bad strike
                bid = _safe_float(row.get("bid"))
                ask = _safe_float(row.get("ask"))
                last = _safe_float(row.get("lastPrice"))
                mid = ((bid + ask) / 2) if (bid and ask) else last
                iv_raw = row.get("impliedVolatility")
                iv_f = _safe_float(iv_raw, default=float("nan"))
                iv = iv_f * 100 if not math.isnan(iv_f) else None

                # Approximate delta — Yahoo doesn't provide greeks
                if spy and kind == "call":
                    delta = 1 / (1 + math.exp(-(spy - strike) / 1.5))
                elif spy and kind == "put":
                    delta = -(1 / (1 + math.exp((spy - strike) / 1.5)))
                else:
                    delta = None

                contracts.append(
                    {
                        "ticker": row.get("contractSymbol"),
                        "type": kind,
                        "strike": strike,
                        "bid": round(bid, 2),
                        "ask": round(ask, 2),
                        "mid": round(mid, 2),
                        "last": round(last, 2),
                        "mark": round(mid, 2),
                        "volume": _safe_int(row.get("volume")),
                        "open_interest": _safe_int(row.get("openInterest")),
                        "iv": round(iv, 2) if iv is not None else None,
                        "delta": round(delta, 3) if delta is not None else None,
                        "gamma": None,
                        "theta": None,
                        "vega": None,
                    }
                )

        return {"underlying_price": spy, "contracts": contracts}
