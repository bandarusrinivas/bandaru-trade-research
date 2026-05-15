#!/usr/bin/env bash
# One-time Schwab OAuth — run this AFTER editing .env with your keys.

set -e
cd "$(dirname "$0")/.."

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python schwab_setup.py

echo ""
read -p "Press Enter to close…"
