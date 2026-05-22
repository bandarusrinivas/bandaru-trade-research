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

# ---------------------------------------------------------------------------
# Credential loading.
#
# IMPORTANT: the project-root .env contains SCHWAB_TOKEN_PATH=./schwab_token.json
# which is correct for host use but WRONG inside the container (the token is
# volume-mounted at /tokens/schwab_token.json). docker-compose sets the correct
# value via the `environment:` block. So we:
#   1. Remember the container-correct token path BEFORE loading .env
#   2. load_dotenv(override=True) to pull in SCHWAB_API_KEY / SCHWAB_APP_SECRET
#   3. Re-pin SCHWAB_TOKEN_PATH so the host .env value can't break the container
# ---------------------------------------------------------------------------
_container_token_path = os.environ.get("SCHWAB_TOKEN_PATH")  # set by docker-compose

for _candidate in ("/app/.env", "/tokens/.env", ".env"):
    if os.path.exists(_candidate):
        load_dotenv(_candidate, override=True)
        print(f"[data_api] loaded .env from {_candidate}")

# Re-pin the token path. Priority:
#   1. The path docker-compose injected (if it points somewhere real)
#   2. /tokens/schwab_token.json if the /tokens volume is mounted (container)
#   3. Whatever .env said (host / local dev)
if os.path.isdir("/tokens"):
    os.environ["SCHWAB_TOKEN_PATH"] = "/tokens/schwab_token.json"
elif _container_token_path:
    os.environ["SCHWAB_TOKEN_PATH"] = _container_token_path
print(f"[data_api] SCHWAB_TOKEN_PATH = {os.environ.get('SCHWAB_TOKEN_PATH')}")

_have_key    = bool(os.environ.get("SCHWAB_API_KEY"))
_have_secret = bool(os.environ.get("SCHWAB_APP_SECRET"))
_token_path  = os.environ.get("SCHWAB_TOKEN_PATH", "")
if not (_have_key and _have_secret):
    print("[data_api] WARNING: SCHWAB_API_KEY or SCHWAB_APP_SECRET is missing!")
    print("[data_api]   key present:", _have_key, "  secret present:", _have_secret)
else:
    print("[data_api] Schwab credentials loaded")
if _token_path and not os.path.exists(_token_path):
    print(f"[data_api] WARNING: token file not found at {_token_path}")
elif _token_path:
    print(f"[data_api] token file found at {_token_path}")

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


def reset_client():
    """
    Drop the cached SchwabClient so the next request re-reads the token file.
    Called after a token error — lets a freshly re-OAuth'd token take effect
    without needing a container restart.
    """
    global _client
    _client = None


def err_response(err: Exception, status: int = 500):
    """
    Surface the *actual* Schwab response so we can debug 401/403/etc. Many
    schwab-py errors stringify with empty bodies — we dig into the underlying
    httpx response when present to get the real reason.
    """
    import traceback
    msg = str(err) or err.__class__.__name__
    detail = {}

    # Reach into httpx.HTTPStatusError if that's what was raised
    resp = getattr(err, "response", None)
    if resp is not None:
        detail["http_status"] = getattr(resp, "status_code", None)
        try:
            detail["http_body"] = resp.json()
        except Exception:
            try:
                detail["http_body"] = resp.text[:500]
            except Exception:
                pass
        try:
            detail["http_url"] = str(resp.request.url) if resp.request else None
        except Exception:
            pass

    # Print a full traceback in the sidecar container logs so the user can see it
    print(f"\n[data_api] ERROR: {type(err).__name__}: {msg}")
    if detail:
        print(f"[data_api] detail: {detail}")
    traceback.print_exc()

    is_auth = (
        "token" in msg.lower()
        or "401" in msg
        or "unauthorized" in msg.lower()
        or detail.get("http_status") in (401, 403)
    )
    if is_auth:
        # Drop the cached client so a freshly re-authorized token is picked up
        # on the next request without a container restart.
        reset_client()
        status = 503
        body = {
            "error": "Schwab token rejected — re-run auth-schwab.command",
            "raw": msg,
            **detail,
        }
    else:
        body = {"error": msg, **detail}
    return jsonify(body), status


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.route("/data/raw-test")
def raw_test():
    """
    Hits Schwab's /quotes endpoint directly and returns the FULL raw response.
    Use this to debug token_invalid errors — shows exactly what Schwab is
    sending back (status code + body) so we can tell if the token is bad,
    the app permission is missing, or the account doesn't have market data.
    """
    ticker = request.args.get("ticker", "SPY").upper()
    try:
        client = get_client()
        resp = client.client.get_quote(ticker)
        body = None
        try:
            body = resp.json()
        except Exception:
            body = resp.text[:1000]
        return jsonify({
            "ticker": ticker,
            "http_status": resp.status_code,
            "http_url": str(resp.request.url) if resp.request else None,
            "ok": resp.is_success,
            "body": body,
            "token_path": os.environ.get("SCHWAB_TOKEN_PATH"),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "ticker": ticker,
            "exception": type(e).__name__,
            "message": str(e),
        }), 500


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
        "api_key_loaded":    bool(os.environ.get("SCHWAB_API_KEY")),
        "app_secret_loaded": bool(os.environ.get("SCHWAB_APP_SECRET")),
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
# Multi-day support: takes period=1d|2d|3d|5d and uses schwab-py's per-minute
# methods with an explicit start_datetime.
# ---------------------------------------------------------------------------
def _interval_to_frequency_minutes(interval: str) -> int:
    table = {
        "1m": 1, "5m": 5, "15m": 15, "30m": 30,
        "60m": 30, "1h": 30,
    }
    return table.get(interval.lower(), 5)


PERIOD_DAYS_INTRADAY = {
    "1d": 1, "2d": 2, "3d": 3, "5d": 5,
}


@app.route("/data/intraday")
def intraday():
    ticker = request.args.get("ticker", "SPY").upper()
    interval = request.args.get("interval", "5m")
    period = request.args.get("period", "1d")
    try:
        freq = _interval_to_frequency_minutes(interval)
        client = get_client()
        end_dt = datetime.now(ET)
        days = PERIOD_DAYS_INTRADAY.get(period, 1)

        if days == 1:
            # Single day → today's pre-market open at 4 AM ET
            start_dt = end_dt.replace(hour=4, minute=0, second=0, microsecond=0)
        else:
            # Multi-day → roll back N calendar days from now
            start_dt = end_dt - timedelta(days=days)

        # schwab-py 1.4+: pick the named method matching the requested interval
        method = {
            1:  client.client.get_price_history_every_minute,
            5:  client.client.get_price_history_every_five_minutes,
            10: client.client.get_price_history_every_ten_minutes,
            15: client.client.get_price_history_every_fifteen_minutes,
            30: client.client.get_price_history_every_thirty_minutes,
        }.get(freq, client.client.get_price_history_every_five_minutes)

        resp = method(ticker, start_datetime=start_dt, end_datetime=end_dt)
        resp.raise_for_status()
        candles = (resp.json() or {}).get("candles", []) or []

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
