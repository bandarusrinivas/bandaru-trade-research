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

# ─── 2½. Auto-detect leaked-secrets situation ────────────────────────────
# If any unpushed commit contains files matching the leaked-secret
# patterns we know GitHub's secret-scanning will reject (.env.backup-*,
# .env.bak-*, .env.preauth-*), there's no point continuing — every
# push-to-github run will fail the same way. Reroute to fix-leaked-secrets
# which resets to origin/main, removes the bad files, and pushes one
# clean commit.
LEAKED_FILES=$(git log --name-only --format= origin/main..HEAD 2>/dev/null \
  | sort -u \
  | grep -E '(^|/)\.env\.backup-|(^|/)\.env\.bak-|(^|/)\.env\.preauth-|/schwab_token\.json\.bak|/schwab_token\.json\.preauth-' \
  || true)
if [ -n "$LEAKED_FILES" ]; then
  echo
  printf '\033[1;31m✗ Unpushed commits contain files matching a leaked-secret pattern.\033[0m\n'
  echo "  GitHub's secret-scanning will reject every push attempt until these are"
  echo "  removed from the commit history. The leaked files are:"
  echo "$LEAKED_FILES" | sed 's/^/    /'
  echo
  if [ -x "$PROJECT_ROOT/fix-leaked-secrets.command" ] || [ -f "$PROJECT_ROOT/fix-leaked-secrets.command" ]; then
    echo "→ Routing to fix-leaked-secrets.command instead. It will:"
    echo "    1) reset --soft to origin/main (undoes the bad commits, keeps changes)"
    echo "    2) delete the leaked files from disk"
    echo "    3) make one clean commit"
    echo "    4) push"
    echo
    read -p "Proceed with the fix script? [Y/n] " yn
    yn=${yn:-Y}
    case "$yn" in
      [Yy]*) exec bash "$PROJECT_ROOT/fix-leaked-secrets.command" ;;
      *) echo "Aborted. Run 'bash fix-leaked-secrets.command' yourself."; exit 1 ;;
    esac
  else
    echo "  fix-leaked-secrets.command is missing — clean up manually."
    exit 1
  fi
fi

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
DEFAULT_MSG="Schwab launchers + Yahoo cache + tighter .gitignore"
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

  # ── Safety net — refuse to commit any file matching a secret pattern.
  # GitHub push-protection caught a Discord token leak from .env.backup-*
  # files. This stops the bleeding at the COMMIT step instead of the
  # push step, so you never get a rejected push again from this script.
  DANGER=$(git diff --cached --name-only --diff-filter=AM | \
           grep -E '(^|/)\.env$|\.env\.backup|\.env\.bak|\.env\.preauth-|schwab_token\.json$|schwab_token\.json\.bak|schwab_token\.json\.preauth-' || true)
  if [ -n "$DANGER" ]; then
    echo
    echo "✗ REFUSING TO COMMIT — these staged files match a secret pattern:"
    echo "$DANGER" | sed 's/^/    /'
    echo
    echo "  GitHub push-protection will reject this anyway. Either:"
    echo "    a) Delete the files (preferred): rm <file> && git add -A"
    echo "    b) Add them to .gitignore and 'git rm --cached <file>'"
    echo "    c) If you genuinely meant to commit one of these (e.g. .env.example"
    echo "       is FINE), un-stage with 'git restore --staged <file>' and re-run."
    echo
    echo "  Cancelling. No commit made; no push attempted."
    exit 1
  fi

  echo "→ git commit"
  git commit -m "$MSG"
fi

echo
echo "→ git push (first push may prompt for GitHub credentials)"
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo
echo "✓ Pushed successfully."
echo "  View at: $(git remote get-url origin | sed 's/\.git$//')"
