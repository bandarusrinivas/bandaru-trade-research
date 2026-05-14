#!/usr/bin/env bash
# Bandaru Trade Analysis — START
# Launches the dashboard. Uses Schwab if token exists, otherwise runs OAuth
# then starts. Reads DATA_SOURCE from .env (schwab / yahoo / demo).

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# Detect data source — DATA_SOURCE env wins; otherwise read .env; default schwab
SRC="${DATA_SOURCE:-}"
if [ -z "$SRC" ] && [ -f ".env" ]; then
    SRC=$(grep -E '^DATA_SOURCE=' .env | head -1 | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d '[:space:]')
fi
SRC="${SRC:-schwab}"

# Free port 5000 if a previous Flask is still alive
if lsof -ti:5000 >/dev/null 2>&1; then
    echo "Stopping previous server on port 5000…"
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# If Schwab is selected and no token yet, run OAuth first
if [ "$SRC" = "schwab" ] && [ ! -f "schwab_token.json" ]; then
    echo "================================================"
    echo "  No Schwab token — running one-time OAuth"
    echo "================================================"
    # Prefer the auto-flow (reads URL from Safari, no copy/paste)
    if [ -f "schwab_oauth.py" ]; then
        python schwab_oauth.py || {
            echo "Auto OAuth failed. Falling back to Yahoo for this session."
            SRC="yahoo"
        }
    else
        python schwab_setup.py || {
            echo "OAuth failed. Falling back to Yahoo for this session."
            SRC="yahoo"
        }
    fi
fi

echo "================================================"
echo "  Bandaru Trade Analysis — LIVE ($SRC)"
echo "================================================"
echo "Starting on http://localhost:5000 …"
echo "Opening Safari in 2 seconds. (Press Ctrl+C to stop the server.)"
echo ""

( sleep 2 && open -a Safari "http://127.0.0.1:5000" ) &

DATA_SOURCE="$SRC" python app.py
