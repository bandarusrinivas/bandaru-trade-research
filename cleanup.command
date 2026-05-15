#!/usr/bin/env bash
# Bandaru Trade Research — cleanup deprecated root launchers (Mac).
# Run ONCE after migrating to the scripts/ layout. Deletes the deprecation
# stubs that were placed at the project root, plus any leftover sed .bak files.
#
# Safe to re-run — only removes files that are actually deprecation stubs
# (verified by checking their content begins with `# DEPRECATED stub`).

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Cleanup — deprecated root launchers\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

is_stub() {
  # Treat as a stub if its first line is the shebang/header AND the file is
  # under 500 bytes AND the body references scripts/ as the canonical path.
  local f="$1"
  [ -f "$f" ] || return 1
  [ "$(wc -c < "$f")" -lt 500 ] || return 1
  grep -q "DEPRECATED stub" "$f" || return 1
  grep -q "scripts/" "$f" || return 1
}

removed=0
kept=0

# Mac stubs
for name in start-docker start-local start-schwab start-docker-schwab; do
  f="$name.command"
  if is_stub "$f"; then
    rm -f "$f" && { echo "  ✓ removed $f"; removed=$((removed+1)); } || { echo "  ! couldn't remove $f"; kept=$((kept+1)); }
  fi
done

# Windows stubs (still present in the repo so Windows users get the same cleanup)
for name in start-docker start-local start-schwab start-docker-schwab; do
  for ext in bat ps1; do
    f="$name.$ext"
    if is_stub "$f"; then
      rm -f "$f" && { echo "  ✓ removed $f"; removed=$((removed+1)); } || { echo "  ! couldn't remove $f"; kept=$((kept+1)); }
    fi
  done
done

# Stray sed .bak files (from the earlier yahoo→data refactor)
find mern/server/routes -maxdepth 1 -name "*.bak" -type f 2>/dev/null | while read f; do
  rm -f "$f" && echo "  ✓ removed $f"
done

echo
echo "Done. Removed $removed stub(s)."
echo
echo "Your project root should now have these scripts at the top level:"
echo "  start.command  (interactive menu)"
echo "  stop.command"
echo "  auth-schwab.command"
echo "  push-to-github.command"
echo "  + .bat versions for Windows"
echo
echo "Mode-specific launchers live in scripts/mac/ and scripts/windows/."
