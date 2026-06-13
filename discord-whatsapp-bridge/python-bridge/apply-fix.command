#!/bin/bash
# Apply the com.hnc.discord bundle-ID fix:
#   1. Copy fixed watcher.py from iCloud → ~/trading/discord-bridge/
#   2. Reset state.json to current max rec_id so we don't flood Telegram
#      with already-seen Discord notifications (which is what 92 backfilled
#      messages would do)
#   3. Restart the daemon via launchctl kickstart

set -e

SRC="/Users/bandarumacbook/Documents/trading/bandaru-trade-research/discord-whatsapp-bridge/python-bridge/watcher.py"
DST="$HOME/trading/discord-bridge/watcher.py"
STATE_DIR="$HOME/.discord-wa-bridge"
STATE_FILE="$STATE_DIR/state.json"
LABEL="com.bandaru.discord-watcher"
DOMAIN="gui/$(id -u)"

PYTHON="$(command -v python3)"
[ -x /opt/homebrew/bin/python3 ] && PYTHON=/opt/homebrew/bin/python3

echo "── step 1: copy fixed watcher.py ──"
cp -p "$DST" "$DST.backup-$(date +%Y%m%d-%H%M%S)"
cp -p "$SRC" "$DST"
echo "✅ copied $SRC → $DST"
echo

echo "── step 2: reset state.json to current max rec_id ──"
mkdir -p "$STATE_DIR"
MAX_REC=$("$PYTHON" - <<'PYEOF'
import sqlite3, os
db = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
print(c.execute("SELECT COALESCE(MAX(rec_id),0) FROM record").fetchone()[0])
PYEOF
)
if [[ "$MAX_REC" =~ ^[0-9]+$ ]] && [ "$MAX_REC" -gt 0 ]; then
  echo "{\"last_rec_id\":$MAX_REC}" > "$STATE_FILE"
  echo "✅ state.json reset to last_rec_id=$MAX_REC (skipping backfill)"
else
  echo "⚠️  could not read max rec_id, leaving state.json unchanged"
fi
echo

echo "── step 3: restart daemon ──"
launchctl kickstart -k "$DOMAIN/$LABEL"
echo "✅ daemon kicked"
echo

echo "── verification ──"
sleep 3
LOG="$HOME/trading/discord-bridge/logs/watcher.out.log"
ERR="$HOME/trading/discord-bridge/logs/watcher.err.log"
echo "last 5 lines of stdout:"
tail -n 5 "$LOG" | sed 's/^/  /'
echo
if [ -s "$ERR" ]; then
  echo "stderr (last 5):"
  tail -n 5 "$ERR" | sed 's/^/  /'
else
  echo "stderr: empty ✅"
fi
echo
echo "══════════════════════════════════════════════════════════════"
echo "Next: post anything in a watched Discord channel (e.g. pro-chat or"
echo "namrood-alerts in Optionality). Within 5s the daemon should log:"
echo "    [watcher] forwarded 1 (last rec_id=N)"
echo "and the message should arrive on Telegram."
echo
echo "Press Return to close..."
read
