"""Watchlist quote fetcher — supports multiple tickers in one call.

Default watchlist covers the indices a SPY day-trader watches to gauge
broad-market direction, plus a few mega-cap stocks that drive index moves.
Uses yfinance — same dependency we already pulled in.
"""
from __future__ import annotations

try:
    import yfinance as yf
except ImportError:
    yf = None


# Curated default watchlist (used when user has no custom list)
DEFAULT_SYMBOLS = [
    # Index ETFs — broad market direction
    {"symbol": "SPY",  "name": "S&P 500 ETF",   "group": "Index"},
    {"symbol": "QQQ",  "name": "Nasdaq 100",    "group": "Index"},
    {"symbol": "IWM",  "name": "Russell 2000",  "group": "Index"},
    {"symbol": "DIA",  "name": "Dow Jones",     "group": "Index"},
    # Volatility — fear gauge
    {"symbol": "^VIX", "name": "VIX",           "group": "Vol"},
    {"symbol": "VXX",  "name": "VIX Futures ETN", "group": "Vol"},
    # Mega caps that drive SPY
    {"symbol": "NVDA", "name": "NVIDIA",         "group": "Mega"},
    {"symbol": "AAPL", "name": "Apple",          "group": "Mega"},
    {"symbol": "MSFT", "name": "Microsoft",      "group": "Mega"},
    {"symbol": "GOOGL", "name": "Alphabet",      "group": "Mega"},
    {"symbol": "META", "name": "Meta",           "group": "Mega"},
    {"symbol": "TSLA", "name": "Tesla",          "group": "Mega"},
    {"symbol": "AMZN", "name": "Amazon",         "group": "Mega"},
    {"symbol": "AMD",  "name": "AMD",            "group": "Mega"},
]

# Lookup table: symbol → friendly name (used for ad-hoc additions)
KNOWN_NAMES = {entry["symbol"]: entry["name"] for entry in DEFAULT_SYMBOLS}
KNOWN_NAMES.update({
    # Common adds that aren't in default list
    "NFLX": "Netflix", "DIS": "Disney", "BA": "Boeing", "JPM": "JPMorgan",
    "V": "Visa", "MA": "Mastercard", "WMT": "Walmart", "HD": "Home Depot",
    "BAC": "Bank of America", "XOM": "ExxonMobil", "CVX": "Chevron",
    "JNJ": "Johnson & Johnson", "PG": "Procter & Gamble", "KO": "Coca-Cola",
    "PEP": "PepsiCo", "INTC": "Intel", "ORCL": "Oracle", "CRM": "Salesforce",
    "ADBE": "Adobe", "CSCO": "Cisco", "AVGO": "Broadcom", "QCOM": "Qualcomm",
    "TSM": "TSMC", "PLTR": "Palantir", "COIN": "Coinbase", "SHOP": "Shopify",
    "PYPL": "PayPal", "SQ": "Block", "UBER": "Uber", "LYFT": "Lyft",
    "F": "Ford", "GM": "GM", "RIVN": "Rivian", "LCID": "Lucid",
    "GLD": "Gold ETF", "SLV": "Silver ETF", "USO": "Oil ETF",
    "TLT": "20yr Treasuries", "HYG": "High Yield Bonds",
    "^DJI": "Dow Industrial", "^IXIC": "Nasdaq Composite", "^GSPC": "S&P 500",
    "^RUT": "Russell 2000", "^TNX": "10yr Treasury Yield",
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum",
})


def _name_for(symbol: str) -> str:
    """Best-effort friendly name for a symbol."""
    s = symbol.upper()
    if s in KNOWN_NAMES:
        return KNOWN_NAMES[s]
    # Try yfinance shortName as a one-shot fallback (slow, so we cache)
    if yf is not None:
        try:
            info = yf.Ticker(s).fast_info
            # fast_info doesn't have shortName; try info dict (heavier)
            return s
        except Exception:
            pass
    return s


def fetch_watchlist(symbols: list[dict] | list[str] | None = None) -> dict:
    """Returns a list of quotes for each symbol with price + change + change_pct.

    `symbols` accepts either a list of dicts (with 'symbol', 'name', 'group')
    OR a flat list of ticker strings. Strings get auto-enriched with names.
    """
    if yf is None:
        return {"error": "yfinance not installed"}
    if not symbols:
        syms = DEFAULT_SYMBOLS
    else:
        # Normalize: accept strings or dicts
        syms = []
        for item in symbols:
            if isinstance(item, str):
                sym = item.strip().upper()
                if not sym:
                    continue
                syms.append({
                    "symbol": sym,
                    "name": _name_for(sym),
                    "group": "Custom",
                })
            elif isinstance(item, dict) and item.get("symbol"):
                syms.append(item)
    quote_codes = " ".join([s["symbol"] for s in syms])
    out = []

    try:
        tickers = yf.Tickers(quote_codes)
    except Exception as e:  # noqa: BLE001
        return {"error": f"yfinance fetch failed: {e}"}

    for s in syms:
        sym = s["symbol"]
        try:
            t = tickers.tickers[sym]
            fi = t.fast_info
            price = float(getattr(fi, "last_price", None) or 0)
            prev = float(getattr(fi, "previous_close", None) or 0)
            day_high = float(getattr(fi, "day_high", None) or 0) or None
            day_low = float(getattr(fi, "day_low", None) or 0) or None
            if not price:
                # fallback via daily history
                h = t.history(period="5d", interval="1d")
                if not h.empty:
                    price = float(h.iloc[-1]["Close"])
                    prev = float(h.iloc[-2]["Close"]) if len(h) >= 2 else price

            change = (price - prev) if (price and prev) else None
            change_pct = (change / prev * 100) if (change is not None and prev) else None

            out.append({
                "symbol": sym,
                "name": s.get("name") or sym,
                "group": s.get("group") or "",
                "price": round(price, 2) if price else None,
                "change": round(change, 2) if change is not None else None,
                "change_pct": round(change_pct, 2) if change_pct is not None else None,
                "day_high": round(day_high, 2) if day_high else None,
                "day_low": round(day_low, 2) if day_low else None,
                "direction": ("up" if (change or 0) >= 0 else "down") if change is not None else "flat",
            })
        except Exception as e:  # noqa: BLE001
            out.append({
                "symbol": sym, "name": s.get("name") or sym,
                "group": s.get("group") or "",
                "price": None, "change": None, "change_pct": None,
                "error": str(e),
            })
    return {"symbols": out}
