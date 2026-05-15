"""Bandaru Trade Research — Schwab data sidecar.

A tiny Flask HTTP service that exposes Schwab data in the EXACT shapes the
MERN server expects from its services/yahoo.js adapter. The Node server
then proxies live-data calls to this container when DATA_SOURCE=schwab.

Endpoints (all GET):
    /health                            → {"status": "ok", "source": "schwab"}
    /data/quote?ticker=SPY             → matches yahoo.js getQuote()
    /data/intraday?ticker=SPY&         → matches yahoo.js getIntradayBars()
        interval=5m&period=1d
    /data/daily?ticker=SPY&period=6mo  → matches yahoo.js getDailyBars()
    /data/prevday?ticker=SPY           → matches yahoo.js getPreviousDay()
    /data/chain?ticker=SPY             → matches yahoo.js getOptionChain()

The schwab-py library handles OAuth + token refresh. The token file lives at
the path SCHWAB_TOKEN_PATH (default: /tokens/schwab_token.json in the
container). It must be created on the host first via `auth-schwab.command`
and then mounted into the container as a volume.

Run locally:    python data_api.py
Run in docker:  Dockerfile entry point
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

import pytz
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

# Add this folder to sys.path so we can import src.clients.schwab_client
sys.path.insert(0, os.path.dirname(__file__))

from src.clients.schwab_client import SchwabClient  # noqa: E402

app = Flask(__name__)
ET = pytz.timezone("America/New_York")

# ---------------------------------------------------------------------------
# Schwab client — lazy init so a missing token doesn't crash the container on
# boot. First request without a token returns a clear 503 error.
# ---------------------------------------------------------------------------
_client: SchwabClient | None = None
_client_error: str | None = None


def get_client() -> SchwabClient:
    """Lazy-initialize SchwabClient. Re-raises last error for clear 503s."""
    global _client, _client_error
    if _client is not None:
        return _client
    try:
        _client = SchwabClient()
        _client_error = None
        return _client
    except Exception as e:
        _client_error = str(e)
        raise


def err_response(err: Exception, status: int = 500):
    msg = str(err)
    # Differentiate token errors so the MERN side can show a clearer message
    if "token" in msg.lower() or "401" in msg or "unauthorized" in msg.lower():
        status = 503
        msg = f"Schwab token invalid or expired ({msg}). Re-run auth-schwab.command."
    return jsonify({"error": msg}), status


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.route("/health")
def health():
    token_path = os.environ.get(
        "SCHWAB_TOKEN_PATH",
        os.path.join(os.path.dirname(__file__), "schwab_token.json"),
    )
    return jsonify({
        "status": "ok",
        "source": "schwab",
        "token_path": token_path,
        "token_exists": os.path.exists(token_path),
    })


# ---------------------------------------------------------------------------
# /data/quote — match yahoo.js getQuote() shape
# ---------------------------------------------------------------------------
@app.route("/data/quote")
def quote():
    ticker = request.args.get("ticker", "SPY").upper()
    try:
        q = get_client().get_current_quote(ticker)
        return jsonify({
            "price": q.get("price"),
            "change": q.get("change"),
            "change_pct": q.get("change_pct"),
            "day_open": q.get("day_open"),
            "day_high": q.get("day_high"),
            "day_low": q.get("day_low"),
            "day_volume": q.get("day_volume"),
            "session": q.get("session", "regular"),
        })
    except Exception as e:
        return err_response(e)


# ---------------------------------------------------------------------------
# /data/intraday — match yahoo.js getIntradayBars() shape: [{t,o,h,l,c,v},…]
# ---------------------------------------------------------------------------
def _interval_to_frequency_minutes(interval: str) -> int:
    """Map MERN-style interval strings to Schwab frequency-in-minutes."""
    table = {
        "1m": 1, "5m": 5, "15m": 15, "30m": 30,
        "60m": 30,  # Schwab only supports up to 30-min, downsample later if needed
        "1h": 30, "1d": 30,
    }
    return table.get(interval.lower(), 5)


@app.route("/data/intraday")
def intraday():
    ticker = request.args.get("ticker", "SPY").upper()
    interval = request.args.get("interval", "5m")
    period = request.args.get("period", "1d")
    try:
        freq = _interval_to_frequency_minutes(interval)
        candles = get_client().get_today_intraday(ticker, frequency=freq)
        # Optionally extend to multi-day periods
        if period in ("2d", "5d"):
            # Schwab's get_today_intraday is single-day; for multi-day we'd
            # need a longer history call. For now return today's bars.
            pass
        return jsonify([
            {
                "t": c.get("datetime"),
                "o": c.get("open"),
                "h": c.get("high"),
                "l": c.get("low"),
                "c": c.get("close"),
                "v": c.get("volume", 0),
            }
            for c in candles
        ])
    except Exception as e:
        return err_response(e)


# ---------------------------------------------------------------------------
# /data/daily — match yahoo.js getDailyBars() shape: parallel arrays
# ---------------------------------------------------------------------------
PERIOD_DAYS = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825,
}


@app.route("/data/daily")
def daily():
    ticker = request.args.get("ticker", "SPY").upper()
    period = request.args.get("period", "6mo")
    days = PERIOD_DAYS.get(period, 180)
    try:
        client = get_client()
        end_dt = datetime.now(ET)
        start_dt = end_dt - timedelta(days=days)
        resp = client.client.get_price_history_every_day(
            ticker,
            start_datetime=start_dt,
            end_datetime=end_dt,
        )
        resp.raise_for_status()
        candles = (resp.json() or {}).get("candles", []) or []
        return jsonify({
            "highs":      [c["high"] for c in candles],
            "lows":       [c["low"] for c in candles],
            "closes":     [c["close"] for c in candles],
            "opens":      [c["open"] for c in candles],
            "volumes":    [c.get("volume", 0) for c in candles],
            "timestamps": [c["datetime"] for c in candles],
        })
    except Exception as e:
        return err_response(e)


# ---------------------------------------------------------------------------
# /data/prevday — match yahoo.js getPreviousDay() shape
# ---------------------------------------------------------------------------
@app.route("/data/prevday")
def prevday():
    ticker = request.args.get("ticker", "SPY").upper()
    try:
        p = get_client().get_previous_day(ticker)
        return jsonify({
            "high": p["high"], "low": p["low"], "close": p["close"],
            "open": p["open"], "volume": p["volume"], "timestamp": p["timestamp"],
        })
    except Exception as e:
        return err_response(e)


# ---------------------------------------------------------------------------
# /data/chain — match yahoo.js getOptionChain() shape
# ---------------------------------------------------------------------------
@app.route("/data/chain")
def chain():
    ticker = request.args.get("ticker", "SPY").upper()
    try:
        c = get_client().get_options_chain(ticker)
        # SchwabClient already returns the right shape; pass through.
        return jsonify(c)
    except Exception as e:
        return err_response(e)


# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    print(f"Schwab data sidecar listening on http://0.0.0.0:{port}")
    print(f"Token path: {os.environ.get('SCHWAB_TOKEN_PATH', './schwab_token.json')}")
    # threaded=True so concurrent MERN polls don't block each other
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
