#!/usr/bin/env bash
# Start the SPY 0DTE Analyzer dashboard.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "================================================"
echo "  Bandaru Trade Analysis — LIVE (Schwab)"
echo "================================================"
echo ""
echo "Starting on http://localhost:5000"
echo "Opening browser in 2 seconds…"
echo "(Press Ctrl+C in this window to stop the server.)"
echo ""

# Open the dashboard in the user's default browser after a short delay
( sleep 2 && open http://localhost:5000 ) &

python app.py
