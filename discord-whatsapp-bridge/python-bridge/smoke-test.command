#!/bin/bash
# Run the daemon's smoke test directly via watcher.py with explicit paths
# (bypassing bridge-ctl which has a path bug after the migration).

DAEMON="$HOME/trading/discord-bridge"
PYTHON="$("$DAEMON/bridge-ctl" 2>/dev/null | grep -o '/[^ ]*python[^ ]*' | head -1)"
[ -z "$PYTHON" ] && PYTHON="$(command -v python3)"

echo "Using:"
echo "  python: $PYTHON"
echo "  watcher: $DAEMON/watcher.py"
echo "  env:    $DAEMON/.env"
echo

"$PYTHON" "$DAEMON/watcher.py" --env "$DAEMON/.env" --smoke

echo
read -p "Press Return to close..."
