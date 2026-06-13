#!/bin/bash
# Smarter dump: shows only the human-readable text fields from the last
# few Discord notifications, and tries to unpack the nested 'usda' bplist
# where Discord may stash additional content.

PYTHON="$(command -v python3)"
[ -x /opt/homebrew/bin/python3 ] && PYTHON=/opt/homebrew/bin/python3

"$PYTHON" - <<'PYEOF'
import sqlite3, plistlib, os, re

db = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
cur = c.cursor()

# Get Discord app_ids
discord_ids = []
for ident in ("com.hnc.discord", "com.hnc.Discord"):
    r = cur.execute("SELECT app_id FROM app WHERE identifier=?", (ident,)).fetchone()
    if r: discord_ids.append(r[0])

placeholders = ",".join("?" * len(discord_ids))
rows = cur.execute(
    f"SELECT rec_id, data FROM record WHERE app_id IN ({placeholders}) "
    f"ORDER BY rec_id DESC LIMIT 8",
    discord_ids
).fetchall()

def walk_strings(obj, found, depth=0, max_depth=8):
    """Recursively find all readable strings in a plist structure."""
    if depth > max_depth: return
    if isinstance(obj, str) and len(obj) > 2 and not re.match(r'^[A-Z_]+$', obj):
        # Skip obvious class-name / key strings
        if not re.match(r'^[A-Z]\w*(\.[A-Z]\w*)*$', obj):
            found.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            walk_strings(v, found, depth+1, max_depth)
    elif isinstance(obj, (list, tuple)):
        for x in obj:
            walk_strings(x, found, depth+1, max_depth)
    elif isinstance(obj, bytes):
        # Try to decode as nested bplist
        if obj.startswith(b'bplist'):
            try:
                nested = plistlib.loads(obj)
                walk_strings(nested, found, depth+1, max_depth)
            except Exception:
                pass

for rec_id, blob in rows:
    print("═" * 70)
    print(f"rec_id = {rec_id}")
    print("═" * 70)
    try:
        p = plistlib.loads(blob)
    except Exception as e:
        print(f"parse failed: {e}")
        continue

    req = p.get('req') if isinstance(p, dict) else None
    if not isinstance(req, dict):
        req = p if isinstance(p, dict) else {}

    # Standard fields
    for k in ('titl','subt','body','Body','title','subtitle'):
        v = req.get(k)
        if v: print(f"  {k:>8}: {v!r}")

    # All keys in req
    print(f"  req keys: {sorted(req.keys())}")

    # Walk nested structures for any readable text we missed
    seen = []
    walk_strings(p, seen)
    # Dedupe & filter for likely message-content strings
    interesting = []
    for s in seen:
        if s in interesting: continue
        if s.startswith('http'): continue
        if s.startswith('com.') or s.startswith('UN') or s.startswith('NS'): continue
        if len(s) > 1 and len(s) < 400:
            interesting.append(s)
    if interesting:
        print(f"  all-readable-strings ({len(interesting)}):")
        for s in interesting[:25]:
            print(f"    - {s!r}")
    print()

PYEOF

echo
echo "Press Return to close..."
read
