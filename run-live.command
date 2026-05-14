#!/usr/bin/env bash
# Start the dashboard with LIVE Yahoo Finance data (~15-min delayed).
# No Schwab keys required. Useful while you wait for Schwab app approval.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Self-install yfinance if not present
python -c "import yfinance" 2>/dev/null || {
    echo "Installing yfinance (one-time)…"
    pip install yfinance >/dev/null
}

# Free port 5000 if a previous server is still running
if lsof -ti:5000 >/dev/null 2>&1; then
    echo "Stopping previous server on port 5000…"
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "================================================"
echo "  Bandaru Trade Research — LIVE (Yahoo Finance)"
echo "================================================"
echo ""
echo "Using Yahoo Finance — quotes are ~15-min delayed during market hours."
echo "Starting on http://localhost:5000 …"
echo "If Chrome blocks localhost on this profile, the script will open Safari instead."
echo "(Press Ctrl+C in this window to stop the server.)"
echo ""

# Open Safari to the dashboard (works even if Chrome is managed-profile blocking localhost)
( sleep 2 && open -a Safari "http://127.0.0.1:5000" ) &

DATA_SOURCE=yahoo python app.py
