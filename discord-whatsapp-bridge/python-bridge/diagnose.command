#!/bin/bash
# Full pipeline diagnostic. Dumps every relevant fact to the screen so
# we can pinpoint where the Discord → Telegram chain is breaking.

DAEMON="$HOME/trading/discord-bridge"
ENV="$DAEMON/.env"
STATE="$HOME/.discord-wa-bridge/state.json"
NOTIF_DB="$HOME/Library/Group Containers/group.com.apple.usernoted/db2/db"

PYTHON="$(command -v python3)"
[ -x /opt/homebrew/bin/python3 ] && PYTHON=/opt/homebrew/bin/python3

cat <<EOF
══════════════════════════════════════════════════════════════
 Discord-WA bridge diagnostic
══════════════════════════════════════════════════════════════

EOF

echo "── 1. Daemon process ──"
PID=$(launchctl print "gui/$(id -u)/com.bandaru.discord-watcher" 2>/dev/null | grep -E "^\s*pid\s*=" | sed -E 's/.*= *([0-9]+).*/\1/')
if [ -n "$PID" ]; then
  echo "✅ launchd reports pid=$PID"
  ps -p "$PID" -o pid,etime,command | tail -1
else
  echo "❌ daemon not running per launchctl"
fi
echo

echo "── 2. state.json (last_rec_id) ──"
if [ -f "$STATE" ]; then
  cat "$STATE"
  echo
else
  echo "(no state file yet)"
fi
echo

echo "── 3. Notification Center DB ──"
"$PYTHON" - <<PYEOF
import sqlite3, os
db = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
try:
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
    cur = c.cursor()
    max_rec = cur.execute("SELECT COALESCE(MAX(rec_id),0) FROM record").fetchone()[0]
    print(f"DB max rec_id: {max_rec}")
    # All app identifiers that have notifications, sorted by count desc
    print()
    print("Apps with notifications (top 15):")
    rows = cur.execute("""
        SELECT a.identifier, COUNT(*) AS n
        FROM record r JOIN app a ON r.app_id = a.app_id
        GROUP BY a.identifier ORDER BY n DESC LIMIT 15
    """).fetchall()
    for ident, n in rows:
        marker = "  ← Discord (the one we filter on)" if ident == "com.hnc.Discord" else ""
        print(f"  {n:5}  {ident}{marker}")
    print()
    # Discord-specific
    discord = cur.execute("SELECT app_id FROM app WHERE identifier='com.hnc.Discord'").fetchone()
    if not discord:
        print("❌ No 'com.hnc.Discord' in app table. Discord may use a different bundle ID.")
        print("   Look at the list above for anything starting with 'com.discord' or similar.")
    else:
        did = discord[0]
        cnt = cur.execute("SELECT COUNT(*) FROM record WHERE app_id=?", (did,)).fetchone()[0]
        latest = cur.execute("SELECT MAX(rec_id) FROM record WHERE app_id=?", (did,)).fetchone()[0] or 0
        print(f"Discord rows: {cnt}, latest rec_id: {latest}")
except sqlite3.OperationalError as e:
    print(f"❌ Cannot open DB: {e}")
    print("   → Make sure FDA is granted to /opt/homebrew/bin/python3")
PYEOF
echo

echo "── 4. Recent Discord notifications (last 5) ──"
"$PYTHON" - <<PYEOF
import sqlite3, plistlib, os
db = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
try:
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
    cur = c.cursor()
    discord = cur.execute("SELECT app_id FROM app WHERE identifier='com.hnc.Discord'").fetchone()
    if not discord:
        print("(skipping — no Discord app row)")
    else:
        rows = cur.execute(
            "SELECT rec_id, data FROM record WHERE app_id=? ORDER BY rec_id DESC LIMIT 5",
            (discord[0],)
        ).fetchall()
        if not rows:
            print("(no Discord notifications stored)")
        for rec_id, blob in rows:
            try:
                p = plistlib.loads(blob)
                req = p.get('req') if isinstance(p, dict) else None
                if not isinstance(req, dict): req = p if isinstance(p, dict) else {}
                t = (req.get('titl') or req.get('title') or '').strip()
                s = (req.get('subt') or req.get('subtitle') or '').strip()
                b = (req.get('body') or '').strip()[:120]
                print(f"  rec_id={rec_id}")
                print(f"    title:    {t!r}")
                print(f"    subtitle: {s!r}")
                print(f"    body:     {b!r}")
            except Exception as e:
                print(f"  rec_id={rec_id}  (bplist parse failed: {e})")
except Exception as e:
    print(f"error: {e}")
PYEOF
echo

echo "── 5. macOS Focus Mode status ──"
defaults read com.apple.controlcenter "NSStatusItem Visible FocusModes" 2>/dev/null || true
shortcuts run "_" 2>&1 | head -1 || true
# Check via assertion API:
"$PYTHON" -c "
import subprocess
r = subprocess.run(['defaults','-currentHost','read','com.apple.controlcenter','DoNotDisturb'], capture_output=True, text=True)
print('DoNotDisturb:', r.stdout.strip() or '(unset)', r.stderr.strip())
"
echo

echo "── 6. Daemon log tail (last 20 lines) ──"
LOG="$DAEMON/logs/watcher.out.log"
ERR="$DAEMON/logs/watcher.err.log"
if [ -f "$LOG" ]; then
  echo "stdout:"
  tail -n 20 "$LOG" | sed 's/^/  /'
fi
echo
if [ -f "$ERR" ] && [ -s "$ERR" ]; then
  echo "stderr:"
  tail -n 20 "$ERR" | sed 's/^/  /'
else
  echo "stderr: (empty — good)"
fi
echo

echo "══════════════════════════════════════════════════════════════"
echo " Press Return to close..."
read
