#!/bin/bash
# Dump the full bplist payload for the last few Discord notifications so we
# can see which fields contain the actual message content. Useful when the
# watcher seems to be sending truncated content (e.g. only "@Pro" without
# the rest).

PYTHON="$(command -v python3)"
[ -x /opt/homebrew/bin/python3 ] && PYTHON=/opt/homebrew/bin/python3

"$PYTHON" - <<'PYEOF'
import sqlite3, plistlib, os, json, pprint
db = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
cur = c.cursor()

ids = []
for ident in ("com.hnc.discord", "com.hnc.Discord"):
    row = cur.execute("SELECT app_id FROM app WHERE identifier=?", (ident,)).fetchone()
    if row: ids.append((ident, row[0]))

if not ids:
    print("No Discord rows found.")
    raise SystemExit

print(f"Discord app_ids: {ids}")
print()

for ident, app_id in ids:
    rows = cur.execute(
        "SELECT rec_id, data FROM record WHERE app_id=? ORDER BY rec_id DESC LIMIT 4",
        (app_id,)
    ).fetchall()
    for rec_id, blob in rows:
        print("═" * 70)
        print(f"rec_id={rec_id}  (app: {ident})")
        print("═" * 70)
        try:
            p = plistlib.loads(blob)
            pprint.pprint(p, width=120, depth=4)
        except Exception as e:
            print(f"parse failed: {e}")
        print()
PYEOF

echo
echo "Press Return to close..."
read
