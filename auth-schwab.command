#!/usr/bin/env bash
# Bandaru — Schwab OAuth (auto-flow)
# Runs schwab_oauth.py which opens Safari, reads the redirect URL directly
# from Safari's address bar via AppleScript, exchanges it for a token, and
# saves to schwab_token.json. NO copy/paste required.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

if [ ! -f "schwab_oauth.py" ]; then
    echo "schwab_oauth.py is missing. Falling back to the manual prompt flow."
    python schwab_setup.py
else
    python schwab_oauth.py
fi

echo ""
read -p "Press Enter to close this window…"
