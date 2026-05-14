"""Flask web app — SPY 0DTE Options Analyzer (Schwab API)."""
from __future__ import annotations

import os
from datetime import datetime

import re

import pytz
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from analysis import (
    build_recommendations,
    calculate_pivots,
    get_today_expiration,
    market_stats,
    option_levels,
)
from indicators import compute_daily_indicators
from pro_indicators import compute_pro_signals
from greeks import fill_greeks
from watchlist import fetch_watchlist
from _version import __version__ as APP_VERSION

load_dotenv()

app = Flask(__name__)


@app.route("/api/version")
def version():
    """Return the running app version + build metadata."""
    return jsonify({
        "version": APP_VERSION,
        "data_source": DATA_SOURCE,
        "product": "Bandaru Trade Research",
    })


@app.context_processor
def inject_version():
    """Make {{ app_version }} available in every template."""
    return {"app_version": APP_VERSION}

_client = None
DEMO_MODE = os.environ.get("DEMO_MODE", "").lower() in ("1", "true", "yes")
# DATA_SOURCE = "schwab" (default), "yahoo", or "demo"
DATA_SOURCE = os.environ.get("DATA_SOURCE", "").lower().strip()
if DEMO_MODE:
    DATA_SOURCE = "demo"
elif not DATA_SOURCE:
    DATA_SOURCE = "schwab"


_TICKER_RE = re.compile(r"^[\^A-Za-z0-9._-]{1,10}$")


def _safe_ticker(default: str = "SPY") -> str:
    """Pull and sanitize the requested ticker from the query string."""
    t = (request.args.get("ticker") or "").strip().upper()
    if not t:
        return default
    if not _TICKER_RE.match(t):
        return default
    return t


_active_source = None  # actual source in use (may differ from DATA_SOURCE after auto-fallback)


def _make_yahoo():
    from yahoo_client import YahooClient
    return YahooClient()


def get_client():
    """Return a data client matching DATA_SOURCE.

    If Schwab fails to initialize (no token, bad token, etc.), auto-fallback
    to Yahoo so the dashboard remains usable.
    """
    global _client, _active_source
    if _client is None:
        if DATA_SOURCE == "demo":
            from demo_client import DemoClient
            _client = DemoClient()
            _active_source = "demo"
        elif DATA_SOURCE == "yahoo":
            _client = _make_yahoo()
            _active_source = "yahoo"
        elif DATA_SOURCE in ("uw", "unusualwhales", "unusual_whales", "unusual-whales"):
            from unusual_whales_client import UnusualWhalesClient
            _client = UnusualWhalesClient()
            _active_source = "unusual_whales"
        elif DATA_SOURCE in ("tasty", "tastytrade", "tasty_trade"):
            from tastytrade_client import TastyTradeClient
            _client = TastyTradeClient()
            _active_source = "tastytrade"
        else:
            # Schwab is the default; fall back to Yahoo if init fails
            try:
                from schwab_client import SchwabClient
                _client = SchwabClient()
                _active_source = "schwab"
            except Exception as e:
                print(f"[FALLBACK] Schwab init failed ({type(e).__name__}: {e}); using Yahoo", flush=True)
                _client = _make_yahoo()
                _active_source = "yahoo (Schwab fallback)"
    return _client


def _retry_with_yahoo(method_name, *args, **kwargs):
    """Re-create the client as Yahoo and retry — used when Schwab token is bad."""
    global _client, _active_source
    print(f"[FALLBACK] Switching live client to Yahoo (was {_active_source})", flush=True)
    _client = _make_yahoo()
    _active_source = "yahoo (Schwab fallback)"
    return getattr(_client, method_name)(*args, **kwargs)


def _safe_call(method_name, *args, **kwargs):
    """Call a client method; on token_invalid / auth errors, swap to Yahoo and retry once."""
    client = get_client()
    try:
        return getattr(client, method_name)(*args, **kwargs)
    except Exception as e:
        msg = str(e).lower()
        if any(t in msg for t in ("token_invalid", "401", "unauthorized", "invalid_token", "expired")):
            return _retry_with_yahoo(method_name, *args, **kwargs)
        raise


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analysis")
def analysis():
    try:
        client = get_client()
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e), "setup_required": True}), 400

    ticker = _safe_ticker()
    try:
        prev = _safe_call("get_previous_day", ticker)
        quote = _safe_call("get_current_quote", ticker)
        current_price = quote["price"]
        if not current_price:
            return jsonify({"error": f"No current price returned for {ticker}."}), 500

        pivots = calculate_pivots(prev["high"], prev["low"], prev["close"])
        expiry = get_today_expiration()
        chain_error = None
        try:
            chain = _safe_call("get_options_chain", ticker, expiration_date=expiry, strike_count=40)
            if not chain.get("contracts"):
                chain_error = f"Chain returned 0 contracts for {ticker} @ {expiry}"
                print(f"[CHAIN] {chain_error}", flush=True)
        except Exception as e:
            chain_error = f"{type(e).__name__}: {e}"
            print(f"[CHAIN ERROR] {ticker} @ {expiry}: {chain_error}", flush=True)
            chain = {"underlying_price": current_price, "contracts": []}
        chain["contracts"] = fill_greeks(chain["contracts"], current_price, expiry)
        recs = build_recommendations(current_price, pivots, chain["contracts"], ticker)

        spy_quote = {
            "price": current_price,
            "change": quote.get("change"),
            "change_pct": quote.get("change_pct"),
            "day_open": quote.get("day_open"),
            "day_high": quote.get("day_high"),
            "day_low": quote.get("day_low"),
            "session": quote.get("session"),
            "session_label": quote.get("session_label"),
            "session_data": quote.get("session_data"),
        }
        stats = market_stats(current_price, pivots, prev, spy_quote, chain["contracts"])
        indicators = compute_daily_indicators(ticker)
        pro = compute_pro_signals(ticker)

        et = pytz.timezone("America/New_York")
        return jsonify({
            "timestamp": datetime.now(et).strftime("%Y-%m-%d %H:%M:%S ET"),
            "ticker": ticker,
            "demo": DATA_SOURCE == "demo",
            "data_source": DATA_SOURCE,
            "active_source": _active_source or DATA_SOURCE,
            "stats": stats,
            "indicators": indicators,
            "pro": pro,
            "spy": {
                "price": current_price,
                "change": quote.get("change"),
                "change_pct": quote.get("change_pct"),
                "day_open": quote.get("day_open"),
                "day_high": quote.get("day_high"),
                "day_low": quote.get("day_low"),
            },
            "previous_day": prev,
            "pivots": pivots,
            "expiration": expiry,
            "recommendations": recs,
            "chain_count": len(chain["contracts"]),
            "chain_error": chain_error,
            "option_levels": option_levels(chain["contracts"]),
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.route("/api/chain")
def chain_endpoint():
    try:
        client = get_client()
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e)}), 400

    ticker = _safe_ticker()
    try:
        expiry = get_today_expiration()
        try:
            chain = client.get_options_chain(ticker, expiration_date=expiry, strike_count=40)
        except Exception:
            chain = {"underlying_price": None, "contracts": []}
        underlying = chain.get("underlying_price")
        if underlying:
            chain["contracts"] = fill_greeks(chain["contracts"], underlying, expiry)
        return jsonify({
            "ticker": ticker,
            "expiration": expiry,
            "current_price": underlying,
            "chain": chain["contracts"],
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.route("/api/watchlist")
def watchlist_endpoint():
    """Quotes for the multi-symbol watchlist.

    Accepts ?symbols=A,B,C — if absent, falls back to the curated default.
    """
    try:
        raw = (request.args.get("symbols") or "").strip()
        if raw:
            # Sanitize and dedupe, capped at 30
            syms = []
            seen = set()
            for s in raw.split(","):
                s = s.strip().upper()
                if s and _TICKER_RE.match(s) and s not in seen:
                    seen.add(s)
                    syms.append(s)
                if len(syms) >= 30:
                    break
            return jsonify(fetch_watchlist(syms))
        return jsonify(fetch_watchlist())
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.route("/api/candles")
def candles_endpoint():
    """OHLCV bars for the custom chart. Returns bars + pivots from prev day."""
    ticker = _safe_ticker()
    interval = (request.args.get("interval") or "5m").strip()
    period = (request.args.get("period") or "1d").strip()
    valid_intervals = {"1m", "2m", "5m", "15m", "30m", "60m", "1h", "1d", "1wk", "1mo"}
    valid_periods = {"1d", "2d", "3d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"}
    if interval not in valid_intervals:
        interval = "5m"
    if period not in valid_periods:
        period = "3d"
    # Yahoo restricts 1m to 7-day window etc — clamp combinations
    if interval == "1m" and period not in ("1d", "2d", "3d", "5d"):
        period = "5d"
    # "2d" / "3d" are our own periods — yfinance doesn't accept them. Fetch 5d
    # and trim. For 3d, we keep yesterday + today (real data); the chart
    # reserves space for tomorrow in the rendering layer.
    yfinance_period = "5d" if period in ("2d", "3d") else period
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        hist = t.history(period=yfinance_period, interval=interval, prepost=False)
        # Trim to last 2 trading days for "2d" or "3d" (3d's "tomorrow" is
        # rendered as reserved empty space client-side).
        if period in ("2d", "3d") and not hist.empty:
            try:
                # Find unique trading dates in the result, keep last 2
                dates = sorted({idx.date() for idx in hist.index})
                if len(dates) > 2:
                    keep = set(dates[-2:])
                    hist = hist[hist.index.map(lambda d: d.date() in keep)]
            except Exception:
                pass
        bars = []
        if not hist.empty:
            for idx, row in hist.iterrows():
                try:
                    ts_ms = int(idx.timestamp() * 1000)
                except Exception:
                    continue
                bars.append({
                    "t": ts_ms,
                    "o": float(row["Open"]),
                    "h": float(row["High"]),
                    "l": float(row["Low"]),
                    "c": float(row["Close"]),
                    "v": int(row["Volume"]),
                })
        # Pivots from previous trading day
        pivots = None
        try:
            daily = t.history(period="10d", interval="1d")
            if not daily.empty and len(daily) >= 2:
                prev = daily.iloc[-2]
                pivots = calculate_pivots(float(prev["High"]), float(prev["Low"]), float(prev["Close"]))
        except Exception:
            pass
        # Overnight high/low + volume-confirmation signal for chart overlays
        extras = {}
        try:
            from pro_indicators import overnight_high_low, volume_confirmation
            onhl = overnight_high_low(ticker)
            extras["onhl"] = onhl
            # VC needs intraday volume series — use the bars we just fetched
            if bars and len(bars) >= 22:
                vols = [b["v"] for b in bars]
                opens = [b["o"] for b in bars]
                closes_b = [b["c"] for b in bars]
                extras["vc"] = volume_confirmation(vols, closes_b, opens)
        except Exception:
            pass

        return jsonify({
            "ticker": ticker,
            "interval": interval,
            "period": period,
            "bars": bars,
            "pivots": pivots,
            "onhl": extras.get("onhl"),
            "vc": extras.get("vc"),
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.route("/api/intraday")
def intraday_endpoint():
    try:
        client = get_client()
    except (ValueError, RuntimeError) as e:
        return jsonify({"error": str(e)}), 400

    try:
        bars = client.get_today_intraday("SPY", frequency=5)
        return jsonify({"bars": bars})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)
