#!/bin/bash
# Install + deploy the OCR-enrichment build:
#   1. Install pyobjc Vision bindings into the Homebrew Python the daemon uses.
#   2. Copy updated watcher.py and the new ocr_enrich.py to the daemon dir.
#   3. Add OCR_ENRICH=true to the daemon's .env (if not already there).
#   4. Restart the daemon.
#   5. Print the manual Screen Recording grant step.

set -e

SRC_DIR="/Users/bandarumacbook/Documents/trading/bandaru-trade-research/discord-whatsapp-bridge/python-bridge"
DAEMON="$HOME/trading/discord-bridge"
ENV="$DAEMON/.env"
LABEL="com.bandaru.discord-watcher"
DOMAIN="gui/$(id -u)"

PYTHON="$(command -v python3)"
[ -x /opt/homebrew/bin/python3 ] && PYTHON=/opt/homebrew/bin/python3
echo "Using Python: $PYTHON"
echo

echo "── step 1: install PyObjC Vision bindings ──"
"$PYTHON" -m pip install --upgrade --break-system-packages \
    pyobjc-framework-Vision pyobjc-framework-Quartz pyobjc-core 2>&1 | tail -5
echo "✅ pyobjc-framework-Vision installed"
echo

echo "── step 2: deploy watcher.py + ocr_enrich.py ──"
cp -p "$DAEMON/watcher.py" "$DAEMON/watcher.py.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
cp -p "$SRC_DIR/watcher.py"    "$DAEMON/watcher.py"
cp -p "$SRC_DIR/ocr_enrich.py" "$DAEMON/ocr_enrich.py"
echo "✅ copied watcher.py and ocr_enrich.py to $DAEMON"
echo

echo "── step 3: enable OCR_ENRICH in $ENV ──"
if grep -qE "^OCR_ENRICH=" "$ENV"; then
  /usr/bin/sed -i '' "s|^OCR_ENRICH=.*|OCR_ENRICH=true|" "$ENV"
  echo "✅ existing OCR_ENRICH line updated to true"
else
  cat >> "$ENV" <<'EOF'

# ── OCR enrichment ──────────────────────────────────────────────────────────
# When a notification's body is shorter than OCR_ENRICH_BODY_THRESHOLD chars,
# the watcher will open the Discord client to that message, screenshot it,
# and run macOS Vision OCR — appending the recognised text to the Telegram
# message. Useful for embed-heavy alert channels where the body is just '@Pro'.
#
# Tradeoffs: steals window focus, +3-5s latency per enriched message, sends
# everything visible in Discord to Telegram. Disable by setting OCR_ENRICH=false.
OCR_ENRICH=true
OCR_ENRICH_BODY_THRESHOLD=30
OCR_WAIT=2.5
EOF
  echo "✅ added OCR_ENRICH=true block to .env"
fi
echo

echo "── step 4: restart daemon ──"
launchctl kickstart -k "$DOMAIN/$LABEL"
echo "✅ daemon kicked"
echo

sleep 3
echo "── verification ──"
LOG="$DAEMON/logs/watcher.out.log"
ERR="$DAEMON/logs/watcher.err.log"
tail -n 5 "$LOG" | sed 's/^/  out: /'
if [ -s "$ERR" ]; then
  echo
  tail -n 5 "$ERR" | sed 's/^/  err: /'
else
  echo "  err: (empty ✅)"
fi
echo

cat <<EOF

═══════════════════════════════════════════════════════════════════════
REQUIRED MANUAL STEP — grant Screen Recording permission to Python:

  1. System Settings → Privacy & Security → Screen Recording
  2. Click +, then press ⌘⇧G and paste:
        $PYTHON
     Click Open, then toggle the new entry ON.
  3. Run this script again so the daemon restarts under the new permission.

Without this grant, screencapture will return a blank or all-black image
and OCR will yield nothing — no error, just empty enrichment.

After that, the next short-body notification (e.g. @Pro alert) will:
  • briefly steal focus while Discord jumps to the message
  • screenshot the Discord window
  • OCR via macOS Vision
  • forward to Telegram with an "── via OCR ──" section appended
═══════════════════════════════════════════════════════════════════════

Press Return to close...
EOF
read
