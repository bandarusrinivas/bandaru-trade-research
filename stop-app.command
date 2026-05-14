#!/usr/bin/env bash
# Bandaru Trade Analysis — STOP
# Kills the Flask server on port 5000. Leaves the Terminal window open.

set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  Bandaru Trade Analysis — STOP"
echo "================================================"
echo ""

if lsof -ti:5000 >/dev/null 2>&1; then
    PIDS=$(lsof -ti:5000)
    echo "Killing Flask server (pid: $PIDS)…"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 0.5
    if lsof -ti:5000 >/dev/null 2>&1; then
        echo "⚠ Server still alive on port 5000. Try Force-quitting Terminal."
    else
        echo "✓ Server stopped."
    fi
else
    echo "No Flask server running on port 5000. (Already stopped.)"
fi

# Also kill any orphaned schwab_setup.py / app.py python processes
ORPHAN=$(pgrep -f "python.*(app.py|schwab_setup.py)" 2>/dev/null || true)
if [ -n "$ORPHAN" ]; then
    echo "Killing orphaned Python processes: $ORPHAN"
    echo "$ORPHAN" | xargs kill -9 2>/dev/null || true
fi

echo ""
read -p "Press Enter to close this window…"
