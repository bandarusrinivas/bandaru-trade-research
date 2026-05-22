#!/usr/bin/env bash
# Bandaru Trade Research — cleanup (Mac).
#
# Removes disposable junk from the project: editor backups, Python caches,
# .DS_Store files, old token backups, stale build output. Safe to re-run.
# Pass --dry-run to preview without deleting anything.
#
# It NEVER touches source code, your .env, your Schwab token, node_modules,
# the Python venvs, or Docker volumes (your trade journal).

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
  esac
done

printf '\n\033[1;36m========================================\033[0m\n'
if [ "$DRY_RUN" = "1" ]; then
  printf '\033[1;36m  Cleanup (DRY RUN — nothing removed)\033[0m\n'
else
  printf '\033[1;36m  Cleanup\033[0m\n'
fi
printf '\033[1;36m========================================\033[0m\n\n'

TALLY=$(mktemp)
echo "0 0" > "$TALLY"

_pretty() {
  local b=$1
  if   [ "$b" -ge 1073741824 ]; then awk -v b="$b" 'BEGIN{printf "%.1fG", b/1073741824}'
  elif [ "$b" -ge 1048576    ]; then awk -v b="$b" 'BEGIN{printf "%.1fM", b/1048576}'
  elif [ "$b" -ge 1024       ]; then awk -v b="$b" 'BEGIN{printf "%.1fK", b/1024}'
  else echo "${b}B"; fi
}

_rm() {
  local p="$1"
  [ -e "$p" ] || return 0
  local size
  if [ -d "$p" ]; then
    size=$(du -sk "$p" 2>/dev/null | awk '{print $1*1024}')
  else
    size=$(stat -f%z "$p" 2>/dev/null || stat -c%s "$p" 2>/dev/null || echo 0)
  fi
  if [ "$DRY_RUN" = "1" ]; then
    printf '  \033[1;33m[dry-run]\033[0m would remove %s (%s)\n' "$p" "$(_pretty "$size")"
    awk -v n=1 -v b="$size" '{print $1+n, $2+b}' "$TALLY" > "$TALLY.tmp" && mv "$TALLY.tmp" "$TALLY"
  else
    if rm -rf "$p" 2>/dev/null; then
      printf '  \033[1;32m✓\033[0m removed %s (%s)\n' "$p" "$(_pretty "$size")"
      awk -v n=1 -v b="$size" '{print $1+n, $2+b}' "$TALLY" > "$TALLY.tmp" && mv "$TALLY.tmp" "$TALLY"
    else
      printf '  \033[1;31m✗\033[0m could not remove %s (permission?)\n' "$p"
    fi
  fi
}

# ──────────────────────────────────────────────────────────────────
echo "1. Editor / sed backup files (*.bak, *.orig, *~)"
# ──────────────────────────────────────────────────────────────────
find . -type f \( -name "*.bak" -o -name "*.orig" -o -name "*~" \) \
       -not -path "./.git/*" -not -path "./.venv/*" \
       -not -path "./legacy-python/.venv/*" \
       -not -path "./mern/*/node_modules/*" \
       2>/dev/null | while read -r f; do _rm "$f"; done

# ──────────────────────────────────────────────────────────────────
echo
echo "2. Python __pycache__ directories and stray .pyc files"
# ──────────────────────────────────────────────────────────────────
find . -type d -name "__pycache__" \
       -not -path "./.git/*" -not -path "./.venv/*" \
       -not -path "./legacy-python/.venv/*" \
       2>/dev/null | while read -r d; do _rm "$d"; done
find . -type f -name "*.pyc" \
       -not -path "./.git/*" -not -path "./.venv/*" \
       -not -path "./legacy-python/.venv/*" \
       2>/dev/null | while read -r f; do _rm "$f"; done

# ──────────────────────────────────────────────────────────────────
echo
echo "3. Old Schwab token backups (the live token is kept)"
# ──────────────────────────────────────────────────────────────────
for f in legacy-python/schwab_token.json.bak*; do
  [ -e "$f" ] || continue
  _rm "$f"
done

# ──────────────────────────────────────────────────────────────────
echo
echo "4. macOS metadata (.DS_Store)"
# ──────────────────────────────────────────────────────────────────
find . -name ".DS_Store" \
       -not -path "./.git/*" -not -path "./.venv/*" \
       -not -path "./legacy-python/.venv/*" \
       -not -path "./mern/*/node_modules/*" \
       2>/dev/null | while read -r f; do _rm "$f"; done

# ──────────────────────────────────────────────────────────────────
echo
echo "5. Stale Vite build output (mern/client/dist)"
# ──────────────────────────────────────────────────────────────────
[ -d "mern/client/dist" ] && _rm "mern/client/dist"

# ──────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════════════════"
read -r tally_count tally_bytes < "$TALLY"
rm -f "$TALLY" "$TALLY.tmp" 2>/dev/null
printf '  Summary: %d item(s), %s reclaimed\n' "$tally_count" "$(_pretty "$tally_bytes")"
[ "$DRY_RUN" = "1" ] && echo && echo "  Re-run without --dry-run to actually delete."
echo "═══════════════════════════════════════════════════════════════"
echo
echo "NOT touched (delete by hand if you really want the space back):"
echo "  legacy-python/.venv          Python virtualenv (~50 MB)"
echo "  mern/*/node_modules          npm packages (~300 MB)"
echo "  Docker volumes               run  stop.command  then"
echo "                               'cd mern && docker compose down -v' to wipe Mongo"
