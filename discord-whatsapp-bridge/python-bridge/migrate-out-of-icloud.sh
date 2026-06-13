#!/usr/bin/env bash
# Move the runnable bits out of iCloud Drive to a non-synced location.
# Keeps the source in ~/Documents (for editing) but installs a stable copy
# at ~/Library/Application Support/discord-wa-bridge/ which launchd reads.
# Re-runs install with the new location.

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_PROJECT="$(cd "$SRC_DIR/.." && pwd)"
DEST="$HOME/trading/discord-bridge"
LABEL="com.bandaru.discord-watcher"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

echo "── Migrating out of iCloud ──"
echo " source: $SRC_PROJECT"
echo " target: $DEST"
echo

mkdir -p "$DEST/logs"

# Copy the runnable scripts + config that the daemon needs.
cp -p "$SRC_DIR/watcher.py"                       "$DEST/watcher.py"
cp -p "$SRC_DIR/com.bandaru.discord-watcher.plist" "$DEST/$LABEL.plist"
cp -p "$SRC_DIR/bridge-ctl"                       "$DEST/bridge-ctl"

# Copy .env once. If it already exists at DEST, leave it (you may have
# edited it there); otherwise seed from the iCloud copy.
if [ -f "$DEST/.env" ]; then
  echo " .env: already present at target, not overwriting"
else
  cp -p "$SRC_PROJECT/.env" "$DEST/.env"
  echo " .env: copied from iCloud → target"
fi

chmod +x "$DEST/watcher.py" "$DEST/bridge-ctl"

# Pick a real (non-stub) Python.
detect_python() {
  local candidates=(/opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3)
  local picked=""
  for p in "${candidates[@]}"; do
    if [ -x "$p" ]; then picked="$p"; break; fi
  done
  [ -z "$picked" ] && picked="$(command -v python3 || true)"
  local real
  real="$("$picked" -c "import sys; print(sys.executable)" 2>/dev/null || true)"
  [ -n "$real" ] && [ -x "$real" ] && echo "$real" || echo "$picked"
}

PYTHON="$(detect_python)"
echo " python: $PYTHON"

# Stop any existing instance, write the new plist with non-iCloud paths,
# and bootstrap it.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
sed -e "s|@@PROJECT_DIR@@|$DEST|g" \
    -e "s|@@PYTHON@@|$PYTHON|g" \
    "$DEST/$LABEL.plist" > "$PLIST_DEST"

# The substituted plist also has @@PROJECT_DIR@@/python-bridge/watcher.py
# but in the new location watcher.py lives at the root, not under
# python-bridge/. Fix the script path.
/usr/bin/sed -i '' \
    "s|$DEST/python-bridge/watcher.py|$DEST/watcher.py|g" \
    "$PLIST_DEST"
/usr/bin/sed -i '' \
    "s|$DEST/python-bridge/logs/|$DEST/logs/|g" \
    "$PLIST_DEST"

launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true

echo
echo "✅ Migrated. Daemon now runs from: $DEST"
echo "   plist:    $PLIST_DEST"
echo "   watcher:  $DEST/watcher.py"
echo "   env:      $DEST/.env"
echo "   logs:     $DEST/logs/watcher.{out,err}.log"
echo
echo "── REMAINING MANUAL STEP ──"
echo "Verify Full Disk Access for:  $PYTHON"
echo "  System Settings → Privacy & Security → Full Disk Access"
echo "  If the entry isn't already there: + → ⌘⇧G → paste the path above → Open → toggle ON."
echo
echo "Then tail the logs:"
echo "  tail -f '$DEST/logs/watcher.out.log' '$DEST/logs/watcher.err.log'"
echo
echo "If you ever edit watcher.py, edit the SOURCE in iCloud, then re-run:"
echo "  $0    # re-copies and restarts the daemon"
