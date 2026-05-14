#!/usr/bin/env bash
# Bandaru Trade Research — LIVE Schwab launcher.
# Kills any existing server on :5000, runs OAuth setup if no token exists,
# then starts Flask with the Schwab real-time client.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# Verify keys are in .env
if ! grep -q '^SCHWAB_API_KEY=.\+' .env 2>/dev/null || ! grep -q '^SCHWAB_APP_SECRET=.\+' .env 2>/dev/null; then
    echo "ERROR: SCHWAB_API_KEY and SCHWAB_APP_SECRET must be set in .env first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Free port 5000 if a previous Flask is still alive
if lsof -ti:5000 >/dev/null 2>&1; then
    echo "Stopping previous server on port 5000…"
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# One-time OAuth if the token file doesn't exist
if [ ! -f "schwab_token.json" ]; then
    echo "================================================"
    echo "  No Schwab token found — running one-time OAuth"
    echo "================================================"
    echo ""
    echo "1. A browser window will open to Schwab's login page"
    echo "2. Log in with your regular Schwab BROKERAGE account"
    echo "3. Approve the app"
    echo "4. Browser redirects to https://127.0.0.1 (page looks broken — that's OK)"
    echo "5. Copy the FULL URL from the address bar"
    echo "6. Paste it back into THIS terminal window when prompted"
    echo ""
    python schwab_setup.py
    echo ""
    echo "================================================"
    echo "  OAuth complete — token saved to schwab_token.json"
    echo "================================================"
    echo ""
fi

echo "================================================"
echo "  Bandaru Trade Research — LIVE (Schwab real-time)"
echo "================================================"
echo ""
echo "Starting on http://localhost:5000 …"
echo "Opening Safari in 2 seconds. (Press Ctrl+C in this window to stop.)"
echo ""

( sleep 2 && open -a Safari "http://127.0.0.1:5000" ) &

DATA_SOURCE=schwab python app.py
