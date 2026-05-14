#!/usr/bin/env bash
# Start the dashboard with REAL-TIME data from Unusual Whales.
# Requires UNUSUAL_WHALES_API_KEY in .env.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Sanity-check that the user actually pasted an API key
if [ -f ".env" ]; then
    if ! grep -q "^UNUSUAL_WHALES_API_KEY=." .env || grep -q "^UNUSUAL_WHALES_API_KEY=your_uw_api_key" .env; then
        echo ""
        echo "ERROR: UNUSUAL_WHALES_API_KEY is missing or still the placeholder in .env."
        echo "Open .env, paste your real Unusual Whales API token, save, then re-run this."
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
echo "  Bandaru Trade Analysis — LIVE (Unusual Whales)"
echo "================================================"
echo ""
echo "Real-time SPY quote + 0DTE options chain from Unusual Whales."
echo "Starting on http://localhost:5000 …"
echo "(Press Ctrl+C in this window to stop the server.)"
echo ""

# Open Safari (Chrome managed-profile may block localhost)
( sleep 2 && open -a Safari "http://127.0.0.1:5000" ) &

DATA_SOURCE=unusual_whales python app.py
