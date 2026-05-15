#!/usr/bin/env bash
# Start the dashboard with SYNTHETIC data (no Schwab keys required).
# Use this to preview the UI while you wait for Schwab app approval.

set -e
cd "$(dirname "$0")/.."

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "================================================"
echo "  Bandaru Trade Research — DEMO MODE (synthetic data)"
echo "================================================"
echo ""
echo "Running with SYNTHETIC data (no Schwab account needed)."
echo "Opening http://localhost:5000 in your browser…"
echo "(Press Ctrl+C in this window to stop the server.)"
echo ""

( sleep 2 && open http://localhost:5000 ) &

DEMO_MODE=true python app.py
