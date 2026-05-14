"""Black-Scholes option pricing + Greeks.

Used to fill in delta / gamma / theta / vega when the data source doesn't
provide them (Yahoo Finance is the main offender — it gives IV but no Greeks).

All theta values returned per-day (not per-year, which is the math convention),
so traders can read them directly as "this contract loses $X tomorrow if
nothing else moves."
"""
from __future__ import annotations

import math
from datetime import date, datetime
from typing import Optional

import pytz

SECONDS_PER_YEAR = 365.0 * 24 * 3600
DAYS_PER_YEAR = 365.0


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def time_to_expiry_years(expiry_date_str: str) -> float:
    """Fraction-of-a-year time-to-expiry, assuming SPY 0DTE expires at 4pm ET."""
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    try:
        exp = datetime.strptime(expiry_date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return 0.0
    expiry_dt = et.localize(datetime.combine(exp, datetime.min.time()).replace(hour=16))
    seconds = (expiry_dt - now).total_seconds()
    return max(seconds, 60) / SECONDS_PER_YEAR  # floor at 1 minute to avoid div-by-zero


def black_scholes_greeks(
    spot: float,
    strike: float,
    t_years: float,
    iv: float,
    is_call: bool,
    risk_free: float = 0.045,
) -> dict:
    """Return {price, delta, gamma, theta_per_day, vega_per_1pct}.

    iv: annualized volatility, e.g. 0.18 = 18%.
    t_years: time to expiry in years (use time_to_expiry_years for 0DTE).
    risk_free: annual risk-free rate, default 4.5%.
    """
    if t_years <= 0 or iv <= 0 or spot <= 0 or strike <= 0:
        intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))
        # At/near expiry — gamma spikes near ATM; we approximate with 0 to keep
        # numbers from going to infinity in display.
        return {
            "price": intrinsic,
            "delta": 1.0 if (is_call and spot > strike) else (-1.0 if (not is_call and strike > spot) else 0.0),
            "gamma": 0.0,
            "theta_per_day": 0.0,
            "vega_per_1pct": 0.0,
        }

    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (risk_free + 0.5 * iv * iv) * t_years) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    if is_call:
        price = spot * _norm_cdf(d1) - strike * math.exp(-risk_free * t_years) * _norm_cdf(d2)
        delta = _norm_cdf(d1)
    else:
        price = strike * math.exp(-risk_free * t_years) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)
        delta = _norm_cdf(d1) - 1

    gamma = _norm_pdf(d1) / (spot * iv * sqrt_t)
    # Theta in $/year → convert to $/day
    if is_call:
        theta_year = (
            -(spot * _norm_pdf(d1) * iv) / (2 * sqrt_t)
            - risk_free * strike * math.exp(-risk_free * t_years) * _norm_cdf(d2)
        )
    else:
        theta_year = (
            -(spot * _norm_pdf(d1) * iv) / (2 * sqrt_t)
            + risk_free * strike * math.exp(-risk_free * t_years) * _norm_cdf(-d2)
        )
    theta_per_day = theta_year / DAYS_PER_YEAR

    # Vega per 1% change in vol
    vega_per_1pct = spot * _norm_pdf(d1) * sqrt_t / 100

    return {
        "price": round(price, 3),
        "delta": round(delta, 3),
        "gamma": round(gamma, 4),
        "theta_per_day": round(theta_per_day, 3),
        "vega_per_1pct": round(vega_per_1pct, 3),
    }


def fill_greeks(contracts: list[dict], spot: float, expiry: str) -> list[dict]:
    """Compute and inject Greeks into contracts that don't already have them.

    Idempotent: if a contract already has delta/gamma/theta/vega populated
    (e.g. from Schwab/UW/Tastytrade), leave them alone.
    """
    t = time_to_expiry_years(expiry)
    out = []
    for c in contracts:
        if not isinstance(c, dict):
            continue
        strike = c.get("strike")
        iv_pct = c.get("iv")
        is_call = (c.get("type") or "").lower() == "call"
        # Skip if already populated
        if (
            c.get("delta") is not None
            and c.get("gamma") is not None
            and c.get("theta") is not None
            and c.get("vega") is not None
        ):
            out.append(c)
            continue

        try:
            iv = (iv_pct / 100.0) if iv_pct is not None else 0.18
            g = black_scholes_greeks(spot, float(strike), t, iv, is_call)
            c = dict(c)
            if c.get("delta") is None:
                c["delta"] = g["delta"]
            if c.get("gamma") is None:
                c["gamma"] = g["gamma"]
            if c.get("theta") is None:
                c["theta"] = g["theta_per_day"]
            if c.get("vega") is None:
                c["vega"] = g["vega_per_1pct"]
        except Exception:
            pass
        out.append(c)
    return out
