#!/usr/bin/env bash
# Bandaru Trade Research — push to GitHub (Mac)
# Stages everything, commits with a descriptive message, and pushes to origin.

set -e
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Push to GitHub — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m========================================\033[0m\n\n'

# 1. Clear any stale index lock (common when an earlier git operation was interrupted)
if [ -f .git/index.lock ]; then
  echo "→ Removing stale .git/index.lock"
  rm -f .git/index.lock
fi

# 2. Verify we have a remote configured
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "✗ No 'origin' remote configured."
  echo "  Run: git remote add origin https://github.com/bandarusrinivas/bandaru-trade-research.git"
  exit 1
fi
echo "→ Origin: $(git remote get-url origin)"
echo "→ Branch: $(git rev-parse --abbrev-ref HEAD)"

# 3. Show what we're about to commit
echo
echo "=== Pending changes ==="
git status -s
CHANGE_COUNT=$(git status -s | wc -l | tr -d ' ')
if [ "$CHANGE_COUNT" -eq 0 ]; then
  echo "Nothing to commit. Working tree clean."
  echo
  read -p "Push anyway (in case local commits are ahead)? [y/N] " yn
  case "$yn" in
    [Yy]*) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
else
  echo
  echo "$CHANGE_COUNT file(s) to commit."
fi

# 4. Prompt for a commit message (with default)
DEFAULT_MSG="v$(cat VERSION 2>/dev/null || echo 2.0.0): MERN rewrite + launchers + docs"
echo
read -p "Commit message [default: \"$DEFAULT_MSG\"]: " MSG
MSG="${MSG:-$DEFAULT_MSG}"

# 5. Final confirmation
echo
echo "About to:"
echo "  • git add -A"
echo "  • git commit -m \"$MSG\""
echo "  • git push origin $(git rev-parse --abbrev-ref HEAD)"
echo
read -p "Proceed? [y/N] " yn
case "$yn" in
  [Yy]*) ;;
  *) echo "Aborted."; exit 0 ;;
esac

# 6. Stage + commit + push
if [ "$CHANGE_COUNT" -gt 0 ]; then
  echo
  echo "→ git add -A"
  git add -A
  echo "→ git commit"
  git commit -m "$MSG"
fi

echo
echo "→ git push (first push may prompt for GitHub credentials)"
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo
echo "✓ Pushed successfully."
echo "  View at: $(git remote get-url origin | sed 's/\.git$//')"
