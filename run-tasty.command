#!/usr/bin/env bash
# Start the dashboard with REAL-TIME data from TastyTrade.
# Requires TASTYTRADE_USERNAME + TASTYTRADE_PASSWORD in .env (your tastytrade.com login).
# Your TastyTrade brokerage account must be funded ($1 minimum) for real-time entitlement.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Validate credentials aren't still placeholders
if [ -f ".env" ]; then
    if ! grep -q "^TASTYTRADE_USERNAME=." .env || grep -q "^TASTYTRADE_USERNAME=your_tastytrade_email" .env; then
        echo ""
        echo "ERROR: TASTYTRADE_USERNAME is missing or still the placeholder in .env."
        echo "Open .env, paste your real tastytrade.com login email + password, save."
        open -t .env 2>/dev/null || open .env
        read -p "Press Enter to close…"
        exit 1
    fi
fi

# Free port 5000 if a previous server is still running
if lsof -ti:5000 >/dev/null 2>&1; then
    echo "Stopping previous server on port 5000…"
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "================================================"
echo "  Bandaru Trade Analysis — LIVE (TastyTrade)"
echo "================================================"
echo ""
echo "Real-time SPY + 0DTE options chain via TastyTrade brokerage API."
echo "Starting on http://localhost:5000 …"
echo "(Press Ctrl+C in this window to stop the server.)"
echo ""

( sleep 2 && open -a Safari "http://127.0.0.1:5000" ) &

DATA_SOURCE=tastytrade python app.py
